const fs = require("fs");
const env = require("./env");
const login = require("./login");
const path = require("path");
const axios = require("axios");
const { uploadToGCS, readGCSFile } = require("./gcloud");
const LASTDOWNLOAD_PATH_LOCAL = path.join(env.tmpDir, env.lastDownloadPath);
const { extractText, captureFrame } = require("./ocr");
const { extractAudio, audioToText } = require("./transcribe");

async function downloadFile(url, filename) {
	// Download the file and save it in /tmp directory
	const response = await axios({
		url: url,
		method: "GET",
		responseType: "stream",
	});

	const writer = fs.createWriteStream(path.join(env.tmpDir, filename));
	response.data.pipe(writer);

	return new Promise((resolve, reject) => {
		writer.on("finish", resolve);
		writer.on("error", reject);
	});
}

async function extractInfo(bucketName, filename, caption) {
	switch (path.extname(filename)) {
		case ".jpg":
			//extract text and caption
			var text = await extractText(filename);
			fs.writeFileSync(
				path.join(env.tmpDir, `${filename}-info.txt`),
				`${env.imagePrompt}Text: ${text}\n\nCaption: ${caption}`
			);
		case ".mp4":
			let frameFilename = await captureFrame(filename, env.tmpDir, "00:00:00");
			var text = await extractText(frameFilename);
			let audioFilename = await extractAudio(filename);
			let transcription = await audioToText(audioFilename);
			fs.writeFileSync(
				path.join(env.tmpDir, `${filename}-info.txt`),
				`${env.videoPrompt}Transcription:${transcription}\n\nCaption 1: ${text}\n\nCaption 2: ${caption}`
			);
	}
	await uploadToGCS(bucketName, path.join(env.tmpDir, `${filename}-info.txt`), `${filename}-info.txt`);
}

async function processFile(url, bucketName, filename, destination) {
	await downloadFile(url, filename);
	//extract info for caption/meme analysis
	await uploadToGCS(bucketName, path.join(env.tmpDir, filename), destination);
}

let promises = [];
let index = 0;
let firstCarouselMedia = false;
function processResponseItems(respItems, carouselFolder) {
	//append carouselFolder to every filename
	//will be empty string '' if we are not in a carousel
	var downloadFilename;
	var uploadDest;
	var url;
	respItems.forEach((item) => {
		switch (item.media_type) {
			case 8:
				firstCarouselMedia = true;				
				//dont push extractInfo() below if we are in a carousel
				processResponseItems(item.carousel_media, `carousel${item.id}`);
				break;
			case 1:
				url = item.image_versions2.candidates[0].url;
				downloadFilename = `image${index}.jpg`;
				uploadDest = path.join(carouselFolder, `image${index}+${username}+.jpg`);
				break;
			case 2:
				uploadDest = path.join(carouselFolder, `video${index}+${username}+.mp4`);
				downloadFilename = `video${index}.mp4`;
				url = item.video_versions[0].url;
				break;
		}

		//we need to get the condition at this point, to avoid race conditions and stuff.
		//more specifically, we push an async function and then change firstCarouselMedia, so if we were using the variable directly, it could be changed to false while we are downloading the file, and then we don't push extractInfo when we should have
		const shouldExtractInfo = firstCarouselMedia || carouselFolder === '';

		promises.push(
			(async () => {
				await downloadFile(url, downloadFilename);
				//these can run in any order after weve succesfully donwloaded file so calm
				await Promise.all([
					uploadToGCS(env.bucketName, path.join(env.tmpDir, downloadFilename), uploadDest),
					//only push extractInfo if we are not in carousel - otherwise we run extractInfo once on the first media in the carousel
					shouldExtractInfo ? extractInfo(env.bucketNameMemeData, `${uploadFilename}.txt`, caption) : Promise.resolve()
				]);
			})()
		);

		//if we are in a carousel and weve already processed firstCarouselMedia
		if(firstCarouselMedia){
			firstCarouselMedia = false;
		}
		//so each media has a unique filename
		index++;
	});
}

//returns false if no media to download
async function download() {
	const ig = await login();
	const liked = ig.feed.liked(ig.state.cookieUserId);
	const page = await liked.items();

	try {
		var lastDownload = await readGCSFile(env.bucketNameDetails, env.lastDownloadPath);
	} catch (e) {
		console.log("creating last download");
		//probs needs to be created - write last liked photo as last download
		fs.writeFileSync(LASTDOWNLOAD_PATH_LOCAL, page !== undefined ? page[0].id : "");
		await uploadToGCS(env.bucketNameDetails, LASTDOWNLOAD_PATH_LOCAL, env.lastDownloadPath);
		return false;
	}

	console.log("lastDownload: ", lastDownload);

	//i keeps track of index we are on of urls and also if we need to paginate
	i = 0;

	if (page.length == 0) {
		return false;
	}

	//write the new lastDownload.txt first - incase we only manage to download some items, at least we dont repost any shit next time round
	fs.writeFileSync(LASTDOWNLOAD_PATH_LOCAL, page[0].id);
	await uploadToGCS(env.bucketNameDetails, LASTDOWNLOAD_PATH_LOCAL, env.lastDownloadPath);
	console.log("lastDownload updated:");

	let processingPromises = [];
	//get all items and download/upload up to lastDownload
	while (page[i].id != lastDownload) {
		let respItem = page[i];
		let username = respItem.user.username;
		let caption = respItem.caption.text;
		var url;
		var uploadFilename;
		var downloadFilename;

		switch (respItem.media_type) {
			case 1:
				url = respItem.image_versions2.candidates[0].url;
				downloadFilename = `image${respItem.id}.jpg`;
				uploadFilename = `image${respItem.id}+${username}+.jpg`;
				processingPromises.push(
					(async () => {
						await downloadFile(respItem.image_versions2.candidates[0].url, `image${respItem.id}.jpg`);
						//these can run in any order after weve succesfully donwloaded file so calm
						await Promise.all([
							uploadToGCS(env.bucketName, path.join(env.tmpDir, uploadFilename), uploadFilename),
							extractInfo(env.bucketNameMemeData, `${uploadFilename}.txt`, caption),
						]);
					})()
				);
				break;
			case 2:
				uploadFilename = `video${respItem.id}+${username}+.mp4`;
				downloadFilename = `video${respItem.id}.mp4`;
				url = respItem.video_versions[0].url;
				processingPromises.push(
					(async () => {
						await downloadFile(respItem.video_versions[0].url, `video${respItem.id}.mp4`);
						//these can run in any order after weve succesfully donwloaded file so calm
						await Promise.all([
							uploadToGCS(env.bucketName, path.join(env.tmpDir, uploadFilename), uploadFilename),
							extractInfo(env.bucketNameMemeData, `${uploadFilename}.txt`, caption),
						]);
					})()
				);
				break;
			case 8:
				console.log("8; ", respItem);
				respItem.carousel_media.forEach((subItem, index) => {
					let subItemMediaType = subItem.media_type;

					switch (subItemMediaType) {
						case 1:
							processingPromises.push(
								processFile(
									subItem.image_versions2.candidates[0].url,
									env.bucketName,
									`image${index}-${respItem.id}.jpg`,
									`carousel${respItem.id}/image${index}+${username}+.jpg`
								)
							);
							break;
						case 2:
							processingPromises.push(
								processFile(
									subItem.video_versions[0].url,
									env.bucketName,
									`video${index}-${respItem.id}].mp4`,
									`carousel${respItem.id}/video${index}+${username}+.mp4`
								)
							);
							break;
						default:
							throw new Error("Unknown media type in carousel");
					}
				});
		}

		i++;
		if (i == page.length) {
			const nextPage = await liked.items();
			if (nextPage === undefined) {
				return false;
			}
			page.push(...nextPage);
		}
	}

	if (i == 0) {
		return false;
	}

	await Promise.all(processingPromises);

	return true;
}
module.exports = download;

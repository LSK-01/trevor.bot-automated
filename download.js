const fs = require("fs");
const env = require("./env");
const login = require("./login");
const path = require("path");
const axios = require("axios");
const { uploadToGCS, readGCSFile } = require("./gcloud");
const LASTDOWNLOAD_PATH_LOCAL = path.join(env.tmpDir, env.lastDownloadPath);
const { extractText, captureFrame } = require("./ocr");
const { extractAudio, audioToText } = require("./transcribe");

async function downloadFile(url, filePath) {
	// Download the file and save it in /tmp directory
	const response = await axios({
		url: url,
		method: "GET",
		responseType: "stream",
	});

	const writer = fs.createWriteStream(filePath);
	response.data.pipe(writer);

	return new Promise((resolve, reject) => {
		writer.on("finish", resolve);
		writer.on("error", reject);
	});
}

async function extractInfo(bucketName, mediaPath, infoPath, caption) {
	let infoFilename = path.basename(infoPath);
	let downloadDest = path.join(env.tmpDir, infoFilename);

	switch (path.extname(mediaPath)) {
		case ".jpg":
			//extract text and caption
			var text = await extractText(mediaPath);
			fs.writeFileSync(
				downloadDest,
				`${env.imagePrompt}Text: ${text}\n\nCaption: ${caption}`
			);
			break;
		case ".mp4":
			let framePath = await captureFrame(mediaPath, "00:00:00");
			var text = await extractText(framePath);
			let audioPath = await extractAudio(mediaPath);
			let transcription = await audioToText(audioPath);
			fs.writeFileSync(
				downloadDest,
				`${env.videoPrompt}Transcription:${transcription}\n\nCaption 1: ${text}\n\nCaption 2: ${caption}`
			);
	}
	await uploadToGCS(bucketName, downloadDest, infoPath);
}

let promises = [];
let index = 0;
let firstCarouselMedia = false;
function processResponseItems(respItems, carouselFolder, carouselCaption, lastDownloadIndex) {
	//append carouselFolder to every filename
	//will be empty string '' if we are not in a carousel
	var downloadDest;
	var uploadDest;
	var url;

	for (let i = 0; i < lastDownloadIndex; i++) {
		const item = respItems[i];

		let username = item.user.username;
		let caption = "";
		//we need to get the condition at this point, to avoid race conditions and stuff.
		//more specifically, we push an async function and then change firstCarouselMedia, so if we were using the variable directly, it could be changed to false while we are downloading the file, and then we don't push extractInfo when we should have
		const shouldExtractInfo = firstCarouselMedia || carouselFolder === "";

		if (shouldExtractInfo && carouselCaption === '') {
			//if we should extractInfo and carouselCaption is empty, then we are not on the first item of a carousel so get the actual caption property which will be present, otherwise...
			caption = item.caption?.text || '';
		}
		else{
			//either shouldn't be extracting info or we are on the first item of a carousel so use carouselCaption
			caption = carouselCaption;
		}

		switch (item.media_type) {
			case 8:
				firstCarouselMedia = true;
				//dont push extractInfo() below if we are in a carousel
				processResponseItems(item.carousel_media, `carousel${item.id}`, caption, lastDownloadIndex);
				break;
			case 1:
				url = item.image_versions2.candidates[0].url;
				downloadDest = `image${index}.jpg`;
				uploadDest = path.join(carouselFolder, `image-${index}-${username}.jpg`);
				break;
			case 2:
				uploadDest = path.join(carouselFolder, `video-${index}-${username}.mp4`);
				downloadDest = `video${index}.mp4`;
				url = item.video_versions[0].url;
				break;
		}

		downloadDest = path.join(env.tmpDir, downloadDest);

		promises.push(
			(async () => {
				await downloadFile(url, downloadDest);
				//these can run in any order after weve succesfully donwloaded file so calm
				await Promise.all([
					uploadToGCS(env.bucketName, downloadDest, uploadDest),
					//only push extractInfo if we are not in carousel - otherwise we run extractInfo once on the first media in the carousel
					shouldExtractInfo ? extractInfo(env.bucketNameMemeData, downloadDest ,path.join(carouselFolder, `${index}.txt`), caption) : Promise.resolve(),
				]);
			})()
		);

		//if we are in a carousel and weve already processed firstCarouselMedia
		if (firstCarouselMedia) {
			firstCarouselMedia = false;
		}
		//so each media has a unique filename
		index++;
	}
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

	if (page.length == 0 || page[i].id == lastDownload) {
		return false;
	}

	//TODO UNCOMMENT
	//write the new lastDownload.txt first - incase we only manage to download some items, at least we dont repost any shit next time round
	fs.writeFileSync(LASTDOWNLOAD_PATH_LOCAL, page[0].id);
	await uploadToGCS(env.bucketNameDetails, LASTDOWNLOAD_PATH_LOCAL, env.lastDownloadPath);
	console.log("lastDownload updated:");

	while (page[i].id != lastDownload) {
		i++;
		if (i == page.length) {
			const nextPage = await liked.items();
			if (nextPage === undefined) {
				break;
			}
			page.push(...nextPage);
		}
	}

	processResponseItems(page, "", "", i);

	try {
		await Promise.all(promises);
	} catch (e) {
		console.log("error awaiting processing promises: ", e);
		return false;
	}

	return true;
}
//TODO -remove
(async() => {await download()})()
module.exports = download;

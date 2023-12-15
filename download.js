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
			fs.writeFileSync(downloadDest, `${env.imagePrompt}Text: ${text}\n\nCaption: ${caption}`);
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

let index = 0;
let firstCarouselMedia = false;
let carouselFolder = "";
let carouselCaption, carouselUsername;

async function processResponseItems(mediaItems, isCarousel, numItems) {
	//append carouselFolder to every filename
	//will be empty string '' if we are not in a carousel

	let downloadDest;
	let uploadDest;
	let url;
	let username;
	let caption;
	let item;

	for (let i = 0; i < numItems; i++) {
		console.log("numItems: " ,numItems)
		item = mediaItems[i];

		//set values accordingly
		username = isCarousel ? carouselUsername : item.user?.username || "";
		caption = isCarousel ? carouselCaption : item.caption?.text || "";

		switch (item.media_type) {
			case 8:
				firstCarouselMedia = true;
				carouselCaption = caption;
				carouselUsername = username;
				carouselFolder = `carousel${item.id}`;
				//dont push extractInfo() below if we are in a carousel
				processResponseItems(item.carousel_media, true, item.carousel_media_count);
				continue;
			case 1:
				url = item.image_versions2.candidates[0].url;
				downloadDest = `${index}.jpg`;
				uploadDest = path.join(carouselFolder, `-${index}-${username}-.jpg`);
				console.log("this is a image");
				break;
			case 2:
				uploadDest = path.join(carouselFolder, `-${index}-${username}-.mp4`);
				downloadDest = `${index}.mp4`;
				url = item.video_versions[0].url;
				console.log("this is a video")
				break;
		}

		downloadDest = path.join(env.tmpDir, downloadDest);
		const shouldExtractInfo = firstCarouselMedia || !isCarousel;

		await downloadFile(url, downloadDest);
		await Promise.all([
			uploadToGCS(env.bucketName, downloadDest, uploadDest),
			shouldExtractInfo
				? extractInfo(env.bucketNameMemeData, downloadDest, path.join(carouselFolder, `${index}.txt`), caption)
				: Promise.resolve(),
		]);

		console.log("dowloaded somithng");

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
	if(ig === undefined){
		return false;
	}
	const liked = ig.feed.liked(ig.state.cookieUserId);
	const page = await liked.items();

	let lastDownload;
	try {
		lastDownload = await readGCSFile(env.bucketNameDetails, env.lastDownloadPath);
	} catch (e) {
		console.log("creating last download");
		//probs needs to be created - write last liked photo as last download
		lastDownload = page !== undefined ? page[0].id : "";
		fs.writeFileSync(LASTDOWNLOAD_PATH_LOCAL,	lastDownload );
		await uploadToGCS(env.bucketNameDetails, LASTDOWNLOAD_PATH_LOCAL, env.lastDownloadPath);
	}

	console.log("lastDownload old: ", lastDownload);

	//i keeps track of index we are on of urls and also if we need to paginate
	i = 0;

	if (page.length == 0 || page[0].id == lastDownload) {
		return false;
	}

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
	//TODO
	i--;

	console.log("page[i]: ", page[i].user.username, page[i].caption?.text, page[i].media_type, page[i].id);

	//better to skip a meme than double post a meme
	//TODO
	fs.writeFileSync(LASTDOWNLOAD_PATH_LOCAL, page[i].id);
	await uploadToGCS(env.bucketNameDetails, LASTDOWNLOAD_PATH_LOCAL, env.lastDownloadPath);
	console.log("lastDownload updated: ", page[i].id);

	//lets just pass one - way too many network calls otheriwes and node starts complaining
	try{
		await processResponseItems([page[i]], false, 1);
	}
	catch(e){
		console.log("error processing response items: ", e.message);
	}
	return true;
}
//TODO
/* (async () => {
	await download();
})(); */

module.exports = download;

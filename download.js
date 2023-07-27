const fs = require("fs");
const env = require("./env");
const login = require("./login");
const path = require("path");
const axios = require("axios");
const {uploadToGCS, readGCSFile} = require("./gcloud");
const LASTDOWNLOAD_PATH_LOCAL = path.join(env.tmpDir, env.lastDownloadPath)

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

async function processFile(url, bucketName, filename, destination) {
	await downloadFile(url, filename);
	await uploadToGCS(bucketName, filename, destination);
}

//returns false if no media to download
async function download() {
	const ig = await login();
	const liked = ig.feed.liked(ig.state.cookieUserId);
	const page = await liked.items();

	let lastDownload = "";
	try {
		lastDownload = await readGCSFile(env.bucketNameDetails, env.lastDownloadPath);
	} catch (e) {
		//probs needs to be created - write last liked photo as last download
    fs.writeFileSync(LASTDOWNLOAD_PATH_LOCAL, page !== undefined ? page[0].id : '');
		await uploadToGCS(env.bucketNameDetails, LASTDOWNLOAD_PATH_LOCAL, env.lastDownloadPath);
	}

  console.log("lastDownload: ", lastDownload);


	//i keeps track of index we are on of urls and also if we need to paginate
	i = 0;

	if (page.length == 0) {
		return false;
	}

	let processingPromises = [];
	//get all items and download/upload up to lastDownload
	while (page[i].id != lastDownload) {
		let respItem = page[i];
		let username = respItem.user.username;

		switch (respItem.media_type) {
			case 1:
				processingPromises.push(
					processFile(
						respItem.image_versions2.candidates[0].url,
						env.bucketName,
						`image${respItem.id}.jpg`,
						`image${respItem.id}+${username}+.jpg`
					)
				);
        break;
			case 2:
				processingPromises.push(
					processFile(
						respItem.video_versions[0].url,
						env.bucketName,
						`video${respItem.id}.mp4`,
						`video${respItem.id}+${username}+.mp4`
					)
				);
        break;
			case 8:
        console.log("8; ", respItem)
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
      if(nextPage === undefined){
        return false;
      }
			page.push(...nextPage);
		}
	}

	if (i == 0) {
		return false;
	}

	await Promise.all(processingPromises);

	lastDownload = page[--i].id;
  fs.writeFileSync(LASTDOWNLOAD_PATH_LOCAL, lastDownload);
	await uploadToGCS(env.bucketNameDetails,LASTDOWNLOAD_PATH_LOCAL, env.lastDownloadPath);

	return true;
}
module.exports = download;

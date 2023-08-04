const env = require("./env");
const ffmpeg = require("fluent-ffmpeg");
const vision = require("@google-cloud/vision");
const path = require("path");

const client = new vision.ImageAnnotatorClient({
	keyFilename: env.keyFilename,
});

async function extractText(filePath) {

	// Read the image file
	const [result] = await client.textDetection(filePath);
	const [detections] = result.textAnnotations;
	console.log("Text:");
	console.log(detections.description);
    return detections.description;
}

async function captureFrame(filePath, time) {
	let newFilename = `${path.basename(filePath, path.extname(filePath))}.png`;
	return new Promise((resolve, reject) => {
		ffmpeg(filePath)
			.screenshot({
				timestamps: [time],
				filename: newFilename,
				folder: env.tmpDir,
			})
			.on("end", () => {
				console.log("Screenshots taken");
				resolve(`${env.tmpDir}/${newFilename}`);
			})
			.on("error", (err) => {
				console.error(err);
				reject(err);
			});
	});
}

module.exports = {extractText, captureFrame}
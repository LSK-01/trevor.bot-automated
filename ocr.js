const env = require("./env");
const ffmpeg = require("fluent-ffmpeg");
const vision = require("@google-cloud/vision");

const client = new vision.ImageAnnotatorClient({
	keyFilename: env.keyFilename,
});

async function extractText(filename) {
	// The name of the image file to annotate (replace with your own image path)
	const fileName = `${env.tmpDir}/${filename}`;

	// Read the image file
	const [result] = await client.textDetection(fileName);
	const [detections] = result.textAnnotations;
	console.log("Text:");
	console.log('detections: ', detections.description);
    return detections.description;
}

async function captureFrame(filename, outputPath, time) {
	let newFilename = `${filename}-frame.png`;
	return new Promise((resolve, reject) => {
		ffmpeg(`${env.tmpDir}/${filename}`)
			.screenshot({
				timestamps: [time],
				filename: newFilename,
				folder: outputPath,
			})
			.on("end", () => {
				console.log("Screenshots taken");
				resolve(newFilename);
			})
			.on("error", (err) => {
				console.error(err);
				reject(err);
			});
	});
}

(async () => {
	let framefilename = await captureFrame("video.mp4", env.tmpDir, "00:00:00");
	console.log("framefilename: ", framefilename);
	extractText(framefilename);
})();

module.exports = {extractText, captureFrame}
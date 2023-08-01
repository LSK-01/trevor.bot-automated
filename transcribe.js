// Imports the Google Cloud client library
const speech = require("@google-cloud/speech");
const ffmpeg = require("fluent-ffmpeg");
const env = require("./env");
const fs = require("fs");

async function extractAudio(filename) {
	return new Promise((resolve, reject) => {
		let newFilename = `extracted_${filename}.wav`;
		ffmpeg(`${env.tmpDir}/${filename}`)
			.outputOptions('-vn', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '44100')
			.saveToFile(`${env.tmpDir}/extracted_${filename}.wav`)
			.on("error", function (err) {
				console.log("An error occurred: " + err.message);
				reject(err.message);
			})
			.on("end", function () {
				console.log("Processing finished!");
		
         resolve(newFilename);
			});
	});
}

// Creates a client
const client = new speech.SpeechClient();

async function audioToText(filename) {
	// Reads a local audio file and converts it to base64
	const file = fs.readFileSync(`${env.tmpDir}/${filename}`);
	const audioBytes = file.toString("base64");

	// The audio file's encoding, sample rate in hertz, and BCP-47 language code
	const audio = {
		content: audioBytes,
	};
	const config = {
		encoding: "LINEAR16",
		sampleRateHertz: 44100,
		languageCode: "en-US",
	};
	const request = {
		audio: audio,
		config: config,
	};

	// Detects speech in the audio file
	const [response] = await client.recognize(request);
	const transcription = response.results.map((result) => result.alternatives[0].transcript).join("\n");
	console.log(`Transcription: ${transcription}`);
	return transcription;
}

(async () => {
	let newFilename = await extractAudio("video.mp4");
	console.log("new filename: ", newFilename);

	await audioToText(newFilename);
})();

module.exports = {extractAudio, audioToText};
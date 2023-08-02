// Imports the Google Cloud client library
const speech = require("@google-cloud/speech");
const ffmpeg = require("fluent-ffmpeg");
const env = require("./env");
const fs = require("fs");
const path = require("path");

async function extractAudio(filePath) {
	return new Promise((resolve, reject) => {
		let newFilePath = `${env.tmpDir}/extracted_${path.basename(filePath, path.extname(filePath))}.wav`;

		ffmpeg(filePath)
			.outputOptions("-vn", "-acodec", "pcm_s16le", "-ac", "1", "-ar", "44100")
			.saveToFile(newFilePath)
			.on("error", function (err) {
				console.log("An error occurred: " + err.message);
				reject(err.message);
			})
			.on("end", function () {
				console.log("Processing finished!");
				resolve(newFilePath);
			});
	});
}

// Creates a client
const client = new speech.SpeechClient();

async function audioToText(filePath) {
	// Reads a local audio file and converts it to base64
	const file = fs.readFileSync(filePath);
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

module.exports = { extractAudio, audioToText };

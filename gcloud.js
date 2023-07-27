const { Storage } = require("@google-cloud/storage");
const env = require('./env');

const storage = new Storage({ keyFilename: env.keyFilename });

async function get_token() {
    return await readGCSFile(env.bucketNameDetails, env.tokenPath);
  }

async function uploadToGCS(bucketName, filename, destination) {
	// Uploads a local file to the bucket
	await storage.bucket(bucketName).upload(path.join(tmpDir, filename), {
		destination: destination,
		gzip: true,
	});

	console.log(`${filename} uploaded to ${bucketName}/${destination}.`);
}

async function readGCSFile(bucketName, fileName) {
	const bucket = storage.bucket(bucketName);
	const file = bucket.file(fileName);

	const contents = await file.download();
	const text = contents.toString("utf-8");

	return text;
}

async function deleteFile(fileName) {
	const bucket = storage.bucket(env.bucketName);
	const file = bucket.file(fileName);
  
	await file.delete();
  
	console.log(`File ${fileName} deleted from ${env.bucketName}.`);
  }


module.exports = {uploadToGCS, readGCSFile, deleteFile, get_token, storage}
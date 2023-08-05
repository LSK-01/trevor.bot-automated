const env = require("./env");
const fs = require("fs");
const path = require("path");
const { uploadToGCS, readGCSFile } = require("./gcloud");
const { IgApiClient, IgLoginRequiredError } = require("instagram-private-api");

const SESSION_FILE_PATH = path.join(env.tmpDir, env.sessionPath);

const ig = new IgApiClient();

async function login() {
	ig.state.generateDevice(env.username);

	let savedState;
	try {
		savedState = await readGCSFile(env.bucketNameDetails, env.sessionPath);
		console.log("read went well");
	} catch (e) {
		//probs needs to be created
		console.log("creating sesssion");
		await rewriteSession();
		return;
	}

	await ig.state.deserialize(JSON.parse(savedState));

	try {
		// Attempt to use the session to fetch current user info
		console.log("seeing if we can get current user");
		await ig.account.currentUser();
		console.log("Poop: ", ig.state.cookieUserId);
	} catch (err) {
		console.log("Session seems to be invalid, re-authenticating...");

		try {
			await rewriteSession();
		} catch (e) {
			console.log("rewrite session failed: ", e.message);
		}
	}

	return ig;
}

async function rewriteSession() {
	//doesn't matter if this fails apparently
	try {
		await ig.simulate.preLoginFlow();
	} catch {}

	await ig.account.login(env.username, env.password);
	// After logging in, simulate some of the requests the Instagram app would make
	//process.nextTick(async () => await ig.simulate.postLoginFlow());

	const serializedState = await ig.state.serialize();
	delete serializedState.constants;
	//write to a tmp session.json
	fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(serializedState));
	//upload the file (tmp is ephemeral)
	await uploadToGCS(env.bucketNameDetails, SESSION_FILE_PATH, env.sessionPath);

	return;
}

module.exports = login;

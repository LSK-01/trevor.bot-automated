const axios = require("axios");
const env = require("./env");
const fs = require("fs");
const path = require("path");
const { uploadToGCS, get_token } = require("./gcloud");
const TOKEN_PATH_LOCAL = path.join(env.tmpDir, env.tokenPath);
const url = "https://graph.facebook.com/oauth/access_token";

async function refresh() {
	const token = await get_token();
	console.log("token: ", token);
	console.log("url: ", url);
	console.log("env.client_id: ", env.client_id);
	console.log("env.client_secret: ", env.client_secret);

	const resp = await axios.get(url, {
		params: {
			client_id: env.client_id,
			client_secret: env.client_secret,
			fb_exchange_token: token,
			grant_type: "fb_exchange_token",
		},
	});

	if (resp.data.access_token !== undefined) {
		console.log("new token: ", resp.data.access_token);

		await fs.promises.writeFile(TOKEN_PATH_LOCAL, resp.data.access_token);
		await uploadToGCS(env.bucketNameDetails, TOKEN_PATH_LOCAL, env.tokenPath);
	} else {
		throw new Error("No access token in response");
	}
}

module.exports = { refresh };

/* (async () => {
  try{
    await refresh();
  }
  catch(e){
    console.log('error: ', e.message);

    await sendEmail("Error refreshing token: " + e.message);
  }
})(); */

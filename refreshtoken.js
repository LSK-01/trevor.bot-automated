const axios = require("axios");
const env = require("./env");
const fs = require("fs");
const sendEmail = require("./email");
const{uploadToGCS, get_token} = require("./gcloud");
const TOKEN_PATH_LOCAL = path.join(env.tmpDir, env.tokenPath);
const url = "https://graph.facebook.com/oauth/access_token";

(async () => {
  try{
    await refresh();
  }
  catch(e){
    await sendEmail("Error refreshing token: " + e.message);
  }
})();

async function refresh(){
  const resp = await axios.get(url, {
    params: {
      client_id: env.client_id,
      client_secret: env.client_secret,
      fb_exchange_token: await get_token(),
      grant_type: "fb_exchange_token",
    },
  });

  if (resp.data.access_token !== undefined) {
    await fs.promises.writeFile(TOKEN_PATH_LOCAL, resp.data.access_token);
    await uploadToGCS(env.bucketNameDetails, TOKEN_PATH_LOCAL, env.tokenPath)
  }
  else{
    throw new Error("No access token in response");
  }
}

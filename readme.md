# Trevorbot
- Grabs your liked feed and reposts to the same account.
- [@trevor.bot](https://www.instagram.com/trevor.bot/) on instagram
## Setup
1. Set up your own Instagram account (must be a business account)
2. Link a facebook page to the Instagram account
3. Set up a graph API app
4. Add the facebook user used in step 2 to a role if not already admin
5. Obtain a long lived access token and paste into a file called `access_token.txt`
6. Create a cloudinary account
7. Populate a file `env.js` as required
8. Run `npm init` and `npm install`
#### Use cron to:
- Run `node refreshtoken.js` a minimum of every 50 days.
- Run `node upload-official.js` as often as desired (official API has a rate limit of 200 calls an hour).
## How it works
### Downloading
- If `/media` is empty, `download.js` is run.
- [instagram-private-api](https://github.com/dilame/instagram-private-api) is used to paginate and download all images currently in your liked feed. 
- Session is stored in session.js after first login to avoid suspicion/rate limiting.
- The original posters of each piece of content are stored in a corresponding numbered text file in the `captions` folder. 
- The ID of the last image that was downloaded, `lastdownload`, is stored in a text file, used to ensure the same media isn't downloaded when `/media` becomes empty again.
### Uploading
- `upload-official.js` then chooses a random media item, and finds the relevant caption credit.
- The official Graph API requires a publicly hosted URL of the media to be uploaded as a parameter, hence we host the media temporarily on Cloudinary
- Using the API a container is created.
- We wait for the container to be `"FINISHED"` and then publish.
- The media, locally and on Cloudinary, is destroyed, and the caption file is unlinked.

## Why
The official API does not allow scraping of any content from a users feed due to privacy/copyright concerns, and one gets rate limited quickly on the [instagram-private-api](https://github.com/dilame/instagram-private-api) when uploading (`IgSentryBlockError`). The only solution I found was to use both.# trevorbot-online
# trevorbot-online
# trevor.bot-automated

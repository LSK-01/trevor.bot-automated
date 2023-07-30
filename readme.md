# Trevorbot
- Grabs your liked feed and reposts to the same account.
- [@trevor.bot](https://www.instagram.com/trevor.bot/) on Instagram
## How to get set up
### You will need
- Google cloud
  - Cloud functions to run `uploadPubSub()`
  -  A topic, and Cloud scheduler job which publishes to it
  -  Cloud storage to store the media (`env.bucketName`) and another for metadata (`env.bucketNameDetails`)
- Graph API
  - An App on Meta Developers
  - A Facebook account who has a role on the app and has access to the Instagram account
  - A (long lived) access token 

Populate env.js as required.
## Why
The official API does not allow scraping of any content from a users feed due to privacy/copyright concerns, and one gets rate limited quickly on the [instagram-private-api](https://github.com/dilame/instagram-private-api) when uploading (`IgSentryBlockError`). The only solution I found was to use both. Instagram posts are downloaded and re-hosted to Cloud storage due to copyright concerns (and the API requires the content being published to be hosted).
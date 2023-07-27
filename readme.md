# Trevorbot
- Grabs your liked feed and reposts to the same account.
- [@trevor.bot](https://www.instagram.com/trevor.bot/) on Instagram
## Why
The official API does not allow scraping of any content from a users feed due to privacy/copyright concerns, and one gets rate limited quickly on the [instagram-private-api](https://github.com/dilame/instagram-private-api) when uploading (`IgSentryBlockError`). The only solution I found was to use both.
Gcloud is used for cloud scheduler to trigger cloud functions, and cloud storage because (I think, after some shitty research and intuition) that the Graph API just won't let you upload an image which is hosted on the Instagram CDN (Copyright etc.).
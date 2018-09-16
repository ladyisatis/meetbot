# Meetbot

Get day's events from Meetup API and post them in a Telegram channel when this application runs.

Meant to be used with AWS Lambda, Google Cloud Functions, or even just on a cron job. If you are deploying to a serverless host, run "npm install"/"yarn install" to get the node modules.

You can edit index.js to also specify a template for the Telegram post.

Environment variables:
* **MEETUP_GROUP_NAME** - comes from the Meetup URL e.g. https://meetup.com/MEETUPGROUPNAME/
* **MEETUP_API_KEY** - Get this from [here](https://secure.meetup.com/meetup_api/key/). This user should be joined in the group.
* **TELEGRAM_API_KEY** - API Key for a Telegram bot. Message "Botfather" on Telegram to get one.
* **TELEGRAM_CHANNEL_ID** - Channel ID (e.g. "@mygroupschannel" or "123456789") to post in.
* **DATE_LOCALE** - Optional environment variable that specifies locale. Defaults to en-US

[Demo is here.](https://t.me/bayareafurmeets)
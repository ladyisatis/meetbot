/*
 * Meetup->Telegram Channel Poster
 * by Reverite
 * (Requires Node 8 or above)
 *
 * Environmental variables:
 * - MEETUP_GROUP_NAME
 * - MEETUP_API_KEY
 * - TELEGRAM_API_KEY
 * - TELEGRAM_CHANNEL_ID
 * - DATE_LOCALE (Optional, defaults to "en-US")
 */

const telegramPostTemplate = `*{name}*
{date}
{startTime} to {endTime} ({fromNow})
RSVP/Discussion: [Meetup]({meetupLink})

Hosted by: {hosts}

{summary}

{locationIfSet}`;

const locationIfSetTemplate = `${String.fromCodePoint(10145)} Location:
{addressMultiLine}
{city}, {state} {zip}
[[Google Maps]({googleMapsLink})] [[Apple Maps]({appleMapsLink})] [[Waze]({wazeLink})]`;

const dateFormat = 'dddd, MMMM D, Y';
const timeFormat = 'h:mm A';

/* ----- NO EDITING BELOW THIS LINE ------ */

const amzLambdaHandler = exports.handler = async () => {
	const handlerResponse = { statusCode: 200, body: JSON.stringify('NO_ACTION_TAKEN') };

	if(!('MEETUP_GROUP_NAME' in process.env)) {
		handlerResponse.statusCode = 500;
		handlerResponse.body = JSON.stringify('Missing environment variable MEETUP_GROUP_NAME. Use the group name from the URL, e.g. https://meetup.com/mygroup/ would have the value: mygroup');
		return handlerResponse;
	}

	if(!('MEETUP_API_KEY' in process.env)) {
		handlerResponse.statusCode = 500;
		handlerResponse.body = JSON.stringify('Missing environment variable MEETUP_API_KEY. Create a throwaway account with a strong password, have it join a group, and get the key from https://secure.meetup.com/meetup_api/key/');
		return handlerResponse;
	}

	if(!('TELEGRAM_API_KEY' in process.env)) {
		handlerResponse.statusCode = 500;
		handlerResponse.body = JSON.stringify('Missing environment variable TELEGRAM_API_KEY. Get this from Botfather on Telegram.');
		return handlerResponse;
	}

	if(!('TELEGRAM_CHANNEL_ID' in process.env)) {
		handlerResponse.statusCode = 500;
		handlerResponse.body = JSON.stringify('Missing env TELEGRAM_CHANNEL_ID. Format can either be @myChannelName or the numerical ID number.');
		return handlerResponse;
	}

	try {
		const axios = require('axios');
		const moment = require('moment-timezone');
		const clean = chars => chars.replace('\\', '').replace('\\n', '\n').trim();
		
		if('DATE_LOCALE' in process.env)
			moment.locale(process.env.DATE_LOCALE);

		const timezone = (await axios.get(
			`https://api.meetup.com/${process.env.MEETUP_GROUP_NAME}`,
			{ 'params': 
				{ 'key': process.env.MEETUP_API_KEY, 
				  'only': 'timezone' } 
			}
		)).data.timezone;

		const events = await axios.get(
			`https://api.meetup.com/${process.env.MEETUP_GROUP_NAME}/events`,
			{
				'params': {
					"key": process.env.MEETUP_API_KEY,
					"no_earlier_than": moment().tz(timezone).format('YYYY-MM-DDTHH:mm:ss.SSS'),
					"no_later_than": moment().tz(timezone).add(1, 'days').format('YYYY-MM-DDTHH:mm:ss.SSS'),
					"page": "999",
					"has_ended": "false",
					"status": "upcoming",
					"fields": "duration,event_hosts,how_to_find_us,link,local_date,local_time,name,plain_text_no_images_description,short_link,venue,web_actions"
				}
			}
		);

		if(typeof events.data !== 'undefined') {
			handlerResponse.body = [];

			for(let event of events.data) {
				let start = moment(event.time).tz(event.group.timezone);
				let end = moment(event.time + event.duration).tz(event.group.timezone);
				let desc = clean(event.plain_text_no_images_description).split('\n');

				let post = telegramPostTemplate
					.replace('{name}', clean(event.name))
					.replace('{date}', clean(start.format(dateFormat)))
					.replace('{startTime}', clean(start.format(timeFormat)))
					.replace('{endTime}', clean(end.format(timeFormat)))
					.replace('{fromNow}', clean(start.fromNow()))
					.replace('{hosts}', event.event_hosts.map(host => clean(host.name)).join(', '))
					.replace('{summary}', desc.size > 1 ? `${desc[0]}\n\n${desc[1]}` : `${desc[0]}`)
					.replace('{description}', desc.join('\n\n'))
					.replace('{meetupLink}', event.short_link)
					.replace('{howToFindUs}', clean(event.how_to_find_us));

				if(typeof event.venue !== 'undefined') {
					let mapAddr = encodeURIComponent(`${clean(event.venue.address_1)}` +
						('address_2' in event.venue ? ', ' + clean(event.venue.address_2) : '') + `, ` +
						`${event.venue.city}, ${event.venue.state} ${event.venue.zip}`);
					let coord = `${event.venue.lat},${event.venue.lon}`;

					let location = locationIfSetTemplate
						.replace('{address}', `${clean(event.venue.address_1)}` + 
							('address_2' in event.venue ? `, ${clean(event.venue.address_2)}` : '') +
							('address_3' in event.venue ? `, ${clean(event.venue.address_3)}` : ''))
						.replace('{addressMultiLine}', `${clean(event.venue.address_1)}` +
							('address_2' in event.venue ? `\n${clean(event.venue.address_2)}` : '') +
							('address_3' in event.venue ? `\n${clean(event.venue.address_3)}` : ''))
						.replace('{googleMapsLink}', `https://www.google.com/maps/dir/?api=1&destination=${coord}`)
						.replace('{appleMapsLink}', `https://maps.apple.com/?daddr=${mapAddr}&ll=${coord}`)
						.replace('{wazeLink}', `https://waze.com/ul?q=${mapAddr}&ll=${coord}&navigate=yes`)
						.replace('{city}', clean(event.venue.city))
						.replace('{state}', clean(event.venue.state))
						.replace('{zip}', clean(event.venue.zip));

					post = post.replace('{locationIfSet}', location);
				} else {
					post = post.replace('{locationIfSet}', '');
				}

				let response = await axios.post(
					`https://api.telegram.org/bot${process.env.TELEGRAM_API_KEY}/sendMessage`,
					{ "chat_id": process.env.TELEGRAM_CHANNEL_ID,
					  "text": post,
					  "parse_mode": "Markdown",
					  "disable_web_page_preview": "true" 
					}
				);

				if(!response.data.ok) {
					handlerResponse.statusCode = 500;
					handlerResponse.body.push({ type: 'TELEGRAM_ERROR', error: response.data.result });
				} else {
					handlerResponse.body.push({ type: 'TELEGRAM_SUCCESS', result: response.data.result });
				}
			}
		}
	} catch(e) {
		handlerResponse.statusCode = 500;
		handlerResponse.body = JSON.stringify(e.response.data);
	}

	return handlerResponse;
}

const gcloudHandlerHTTP = exports.gcloudHandlerHTTP = (req, res) => {
	amzLambdaHandler().then(result => {
		res.status(result.statusCode).send(result.body);
	});
}

const gcloudHandlerPubSub = exports.gcloudHandlerPubSub = (data, context) => {
	amzLambdaHandler().then(result => console.log(result.body));
}
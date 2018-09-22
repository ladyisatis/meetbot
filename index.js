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
 *
 * Template Variables:
 * - {{name}} is the event name
 * - {{series}} is if the event regularly happens every X days/weeks/months
 * - startTime, endTime, lastUpdated have to use the {{datetime}} macro
 * - {{fromNow}} is how long until event e.g. "in 2 hours"
 * - {{howToFindUs}} is "how to find us"
 * - {{comments}} is number of comments
 * - {{link}} is the meetup link
 * - {{summaryList}} is the description that is split between line breaks
 * - {{hosts}} is the list of hosts
 * - {{hostsList}} is the list of hosts you can use with the {{each}} macro
 * - {{venue}} is the venue. Some events don't have a venue, so use {{if}} on this.
 * --- {{venue.name}} is venue name
 * --- {{venue.hasAddress}} if it has an address for {{if}}
 * --- {{venue.address[0]}} is address line 1. address[1] for line 2, address[2] for line 3.
 * --- {{venue.city}} is the city
 * --- {{venue.state}} is the state
 * --- {{venue.zip}} is the zip/postal code
 * --- {{venue.countryCode}} is the country code e.g. "us"
 * --- {{venue.countryName}} is the country name e.g. "USA"
 * - {{rsvp}} is RSVP information. Some events don't need RSVP, so use {{if}}
 * --- {{rsvp.isClosed}} if the event is closed to RSVP for {{if}}
 * --- {{rsvp.closesAt}} for what time RSVP closes, use with {{datetime}}
 * --- {{rsvp.opensAt}} for what time RSVP opens
 * --- {{rsvp.refundPolicy}} for the refund policy, use with {{if}}
 *
 * The {{datetime}} macro uses moment formatting, see:
 * https://momentjs.com/docs/#/displaying/
 */

const telegramPostTemplate = `*{{name}}*

{{datetime startTime format='dddd, MMMM D, Y'}}{{#if series}} _({{series}})_{{/if}}
{{datetime startTime format='h:mm A'}} to {{datetime endTime format='h:mm A'}}{{#if rsvp.closesAt}} _(RSVP by {{datetime rsvp.closesAt format='dddd, MMMM D h:mm A'}})_{{/if}}
[Meetup Event Link]({{link}}) ({{RSVPYesNum}} RSVP'd, {{comments}} commented)

_Hosted By_: {{hosts}}

{{summaryList.[0]}}{{#if summaryList.[1]}}

{{summaryList.[1]}}{{#if summaryList.[2]}} [[More...]({{link}})]{{/if}}{{/if}}{{#if howToFindUs}}

*{{howToFindUs}}*{{/if}}{{#if venue}}

${String.fromCodePoint(10145)} Location:
{{venue.name}}
{{venue.addressMultiLine}}
{{venue.city}}, {{venue.state}} {{venue.zip}}
[[Google Maps]({{venue.googleMapsLink}})] [[Apple Maps]({{venue.appleMapsLink}})] [[Waze]({{venue.wazeLink}})] {{/if}}`;

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
		const handlebars = require('handlebars')
		const clean = chars => typeof chars === 'string' ? chars.replace('\\n', '\n').replace('\\', '').trim() : chars;

		handlebars.registerHelper('datetime', function(dateTime, info) {
			return dateTime.format(info.hash.format);
		});

		const templateParser = handlebars.compile(telegramPostTemplate, {
			knownHelpers: 'datetime',
			noEscape: true,
			preventIndent: true
		});

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
					"fields": "comment_count,duration,event_hosts,fee,how_to_find_us,id,name,photo_album,plain_text_no_images_description,rsvp_limit,rsvp_rules,series,short_link,time,venue,web_actions,yes_rsvp_count"
				}
			}
		);

		if(typeof events.data !== 'undefined') {
			handlerResponse.body = [];

			for(let event of events.data) {
				let event_vars = {};

				event_vars.name = clean(event.name);
				event_vars.series = 'series' in event && 'description' in event.series ? event.series.description : false;
				event_vars.startTime = moment(event.time);
				event_vars.endTime = moment(event.time + event.duration);
				event_vars.fromNow = event_vars.startTime.fromNow();
				event_vars.lastUpdated = moment(event.updated);
				event_vars.onWaitlistNum = event.waitlist_count;
				event_vars.RSVPYesNum = event.yes_rsvp_count;
				event_vars.howToFindUs = 'how_to_find_us' in event && event.how_to_find_us !== "" ? clean(event.how_to_find_us) : false;
				event_vars.comments = event.comment_count;
				event_vars.link = event.short_link.replace('http://', 'https://');
				event_vars.summaryList = event.plain_text_no_images_description.replace('\\n', '\n').split('\n\n');

				event_vars.hosts = event.event_hosts.map(host => clean(host.name)).join(', ');
				event_vars.hostsList = [];

				for(let i = 0; i < event.event_hosts.length; i++) {
					event_vars.hostsList.push({
						name: event.event_hosts[i].name,
						bio: clean(event.event_hosts[i].intro),
						photo: event.event_hosts[i].photo.photo_link,
						joined: moment(event.event_hosts[i].join_date)
					});
				}

				if('venue' in event) {
					event_vars.venue = {
						name: clean(event.venue.name),
						latitude: event.venue.lat,
						longitude: event.venue.lon,
						hasAddress: 'address_1' in event.venue && event.venue.address_1 !== '',
						address: []
					}

					if('address_1' in event.venue)
						event_vars.venue.address[0] = event.venue.address_1;
					if('address_2' in event.venue)
						event_vars.venue.address[1] = event.venue.address_2;
					if('address_3' in event.venue)
						event_vars.venue.address[2] = event.venue.address_3;

					if(event_vars.venue.hasAddress)
						event_vars.venue.addressMultiLine = event_vars.venue.address.join('\n');

					event_vars.venue.city = event.venue.city;
					event_vars.venue.state = event.venue.state;
					event_vars.venue.zip = event.venue.zip;
					event_vars.venue.countryCode = event.venue.country;
					event_vars.venue.countryName = event.venue.localized_country_name;

					if(event_vars.venue.hasAddress && event.venue.repinned) {
						event_vars.venue.googleMapsLink = 'https://www.google.com/maps/dir?api=1&destination=' + encodeURIComponent(event.venue.lat + ',' + event.venue.lon);
						event_vars.venue.appleMapsLink = 'https://maps.apple.com/?ll=' + event.venue.lat + ',' + event.venue.lon;
						event_vars.venue.wazeLink = 'https://waze.com/ul?ll=' + event.venue.lat + ',' + event.venue.lon + '&navigate=yes';
					} else {
						event_vars.venue.googleMapsLink = 'https://www.google.com/maps/dir?api=1&destination=' + encodeURIComponent(event.venue.address_1 + ', ' + event.venue.city + ', ' + event.venue.state + ' ' + event.venue.zip);
						event_vars.venue.appleMapsLink = 'https://maps.apple.com/?q=' + encodeURIComponent(event.venue.address_1 + ', ' + event.venue.city + ', ' + event.venue.state + ' ' + event.venue.zip);
						event_vars.venue.wazeLink = 'https://waze.com/ul?q=' + encodeURIComponent(event.venue.address_1 + ', ' + event.venue.city + ', ' + event.venue.state + ' ' + event.venue.zip) + '&ll=' + event.venue.lon + ',' + event.venue.lat + '&navigate=yes';
					}
				} else {
					event_vars.venue = false;
				}

				if('rsvp_rules' in event && typeof event.rsvp_rules.close_time !== 'undefined' || typeof event.rsvp_rules.open_time !== 'undefined') {
					event_vars.rsvp = {};
					event_vars.rsvp.isClosed = event.rsvp_rules.closed;
					event_vars.rsvp.closesAt = typeof event.rsvp_rules.close_time !== 'undefined' ? moment(event.rsvp_rules.close_time) : false;
					event_vars.rsvp.opensAt = typeof event.rsvp_rules.open_time !== 'undefined' ? moment(event.rsvp_rules.open_time) : false;
					event_vars.rsvp.refundPolicy = clean(event.rsvp_rules.refund_policy.notes);
				} else {
					event_vars.rsvp = false;
				}

				event_vars.photo = 'photo_album' in event && 'photo_count' in event.photo_album && event.photo_album.photo_count > 0 ? event.photo_album.photo_sample[0].highres_link : false;

				let post = templateParser(event_vars);
				let tgAPIURL = `https://api.telegram.org/bot${process.env.TELEGRAM_API_KEY}/`;
				let tgParams = {
					chat_id: process.env.TELEGRAM_CHANNEL_ID
				}

				if(event_vars.photo && post.length <= 200) {
					tgAPIURL += 'sendPhoto';
					tgParams.photo = event_vars.photo;
					tgParams.caption = post;
					tgParams.parse_mode = "Markdown";
				} else {
					tgAPIURL += 'sendMessage';
					tgParams.text = post;
					tgParams.parse_mode = 'Markdown';
					tgParams.disable_web_page_preview = 'true';
				}

				let response = await axios.post(tgAPIURL, tgParams);

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
		handlerResponse.body = e;
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

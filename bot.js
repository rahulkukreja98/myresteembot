/**
 * https://steemit.com/@investigation
 */

/////////////

var botUserData = require("./userData.json")

var SECOND = 1000;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var MUST_FOLLOW_SINCE = 7 * MINUTE;

var URL1 = "https://steemit.com/resteem/@abasinkanga/36-abasinkanga-free-resteem-service-to-5000-followers-a-resteem-has-more-value-when-there-are-many-followers";
var URL2 = "https://steemit.com/resteem/@abasinkanga/edited-abasinkanga-resteem-service-faq-frequently-asked-questions";

var RESTEEM_COMMENT = `This post just got resteemed to 5000 followers.
 - [Need a free resteem? Go here](` + URL1 + `)
 - To get a resteem: Send 0.05 SBD to @` + botUserData.name + ` + post link as memo
 - Read the [Abasinkanga Resteem Service - FAQ (Frequently Asked Questions)]](` + URL2 + `) for full details about this service`;

/////////////

var fs = require('fs');
var steem = require('steem');

// URL taken from: https://developers.steem.io/
// If server is unreliable, select another URL
//		or run own node (2GB needed) as described in the linked docs
steem.api.setOptions({ url: 'https://gtg.steem.house:8090/' });

var STEEMITURL = "https://steemit.com/";
var LAST_TRANSACTION_FILEPATH = "./lastHandledTransaction.json";

var botUser = initUser(botUserData);

var lastHandledTransaction = require(LAST_TRANSACTION_FILEPATH).index;

var RESTEEM_PRICE = 0.05;

var resteemqueue = [];
var commentqueue = [];

/////////////

// ## PLAYGROUND ## //

/////////////

setInterval(function () { checkForNewTransactions(); }, 30 * SECOND);

setInterval(function () { resteemAPostsInTheQueue(botUser); }, 1 * SECOND);

setInterval(function () { writeACommentInTheQueue(botUser); }, 40 * SECOND);

setInterval(function () { log("------------- [1 HOUR PASSED] -------------"); }, 1 * HOUR);

/////////////

function checkShouldStop() { return !fs.existsSync("./DontStop"); }

function checkForNewTransactions() {
	if (checkShouldStop()) {
		log("The 'DontStop' file is missing. The program is in ShutDown process.")
		return; // don't handle more transactions, so that the ques will be empty.
	}

	steem.api.getAccountHistory(botUser.name, 99999999, 1000, function (err, accountHistory) {

		if (err) { log(err); return; }
		
		var detectedTransactions = 0;
		var newItems = 0;
		
		var i = accountHistory.length-1;
		var lastIndex = accountHistory[i][1].timestamp
			+ "#" + accountHistory[i][1].block
			+ "#" + accountHistory[i][0];
			
		for (var i in accountHistory) {

			var doResteem = false;
			var doUpvote = false;

			var index = accountHistory[i][1].timestamp 
				+ "#" + accountHistory[i][1].block
				+ "#" + accountHistory[i][0];
			if (index <= lastHandledTransaction) continue;
			else newItems++

			transaction = parseAsTransaction(accountHistory[i]);
			if (transaction === null || transaction === undefined) {
				continue;
			}

			if (transaction.amount < RESTEEM_PRICE) {
				log(transaction.from + " paid " + transaction.amountStrFull + 
					" but the minimum price is " + RESTEEM_PRICE.toFixed(3));
				continue;
			}

			detectedTransactions++;

			log("Transaction detected: " + transaction.from + 
				" payed [" + transaction.amountStrFull + "] with memo " + transaction.memo);

			resteemqueue.push({ author: transaction.author, permlink: transaction.permlink });
			commentqueue.push({ author: transaction.author, permlink: transaction.permlink, body: RESTEEM_COMMENT });

			setLastHandledTransaction(index);
		}

		if (newItems > 0 && detectedTransactions === 0)
			setLastHandledTransaction(lastIndex);
	});
}

function parseAsTransaction(historyItem) {

	var stringified = JSON.stringify(historyItem);
	if (stringified.indexOf('","op":["transfer",{"from":"') == -1)
		return null;

	var transaction = historyItem[1].op[1];
	transaction.timestamp = historyItem[1].timestamp;
	transaction.block = historyItem[1].block;
	transaction.type = historyItem[1].op[0];

	if (transaction.from === botUser.name)
		return null;

	var transactionString = transaction.from + " [" + transaction.amount + "] - '" + transaction.memo + "'";

	try {
		transaction.amountStrFull = transaction.amount;
		var splitted = transaction.amount.split(' ');
		transaction.amountStr = transaction.amount;
		transaction.currency = splitted[1];
		transaction.amountStr = splitted[0];
		transaction.amount = parseFloat(transaction.amountStr);
	}
	catch (ex) {
		log("Failed to parse transaction amount: " + transactionString + "\t : \t" + ex);
		return null;
	}

	try {
		var urlIndex = transaction.memo.indexOf(STEEMITURL);
		if (urlIndex == -1) {
			log(transaction.from + "'s memo doesn't contain a SteemIt link (" + transaction.memo + "). "
				+ "The bot will assume that it was a donation. Thank you. "
				+ "(If it was not a donation, feel free to contact me to settle the problem.)");
			return null;
		}

		var memo = transaction.memo.trim();

		if (memo.indexOf("#") >= 0)
			memo = memo.substring(0, memo.indexOf("#"));
	
		var authorAndPermlink = memo.substring(memo.indexOf('/@') + 2)
		transaction.author = authorAndPermlink.split('/')[0];
		transaction.permlink = authorAndPermlink.substring(transaction.author.length + 1);
	}
	catch (ex) {
		log(transaction.from + "'s memo couldn't be parsed as link (" + transaction.memo + ")",
			transaction.from, transaction.amountStr, transaction.currency);
		return null;
	}

	log(transactionString)
	return transaction;
}

function setLastHandledTransaction(lastIndex) {
	lastHandledTransaction = lastIndex;
	fs.writeFile(LAST_TRANSACTION_FILEPATH, JSON.stringify({ index: lastIndex }), function (err) {
		if (err) {
			log(err);
		} else {
			log("Last interaction (" + lastIndex + ") saved to " + LAST_TRANSACTION_FILEPATH);
		}
	});
}

/////////////

function resteemAPostsInTheQueue(ownUser) {
	if (resteemqueue.length < 1)
		return;

	var post = resteemqueue.shift();10
	resteemPost(ownUser, post.author, post.permlink);
}

function writeACommentInTheQueue(ownUser) {
	if (commentqueue.length < 1)
		return;

	var post = commentqueue.shift();
	createComment(ownUser, post.author, post.permlink, post.body);
}


/////////////

function initUser(ownUser) {
	log("Logging in as @" + ownUser.name + "...");

	var user = {
		wif: steem.auth.toWif(ownUser.name, ownUser.password, 'owner'),
		name: ownUser.name
	};

	log("Logged in!");

	if (user.wif == undefined)
		throw new Error("'wif' is undefined");

	return user;
}

function createComment(ownUser, author, permlink, body) {
	var commentPermlink = steem.formatter.commentPermlink(author, permlink);
	steem.broadcast.comment(ownUser.wif, author, permlink, ownUser.name, commentPermlink, "", body, "", function (err, result) {
		if (!err && result) {
			log('Successful comment: [' + author + '] ' + permlink);
		} else {
			log('Failed to create comment: ' + err);
		}
	});
}

function resteemPost(ownUser, author, permlink) {
	const json = JSON.stringify(['reblog', {
		account: ownUser.name,
		author: author,
		permlink: permlink
	}]);

	steem.broadcast.customJson(ownUser.wif, [], [ownUser.name], 'follow', json, (err, result) => {
		if (!err && result) {
			log('Successful re-steem: [' + author + '] ' + permlink);
		} else {
			var alreadyResteemed = err.message.indexOf("Account has already reblogged this post") > -1;
			log('Failed to re-steem [' + author + '] : '
				+ (alreadyResteemed ? "Account has already reblogged this post" : "Unknown Reason"));

			if (!alreadyResteemed) 
				log('Failed to re-steem [' + author + '] : ' + err);
		}
	});
}

/////////////

var dateFormatOptions = { weekday: "long", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
function log(str) { console.log(new Date().toLocaleTimeString("en-us", dateFormatOptions) + ":  ", str); }

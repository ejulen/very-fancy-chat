const express = require('express');
const path = require('path')
const bodyParser = require('body-parser');
const { create } = require('express-handlebars');
const { format } = require('date-fns');
const { nanoid } = require('nanoid');
const cookieSession = require('cookie-session');

const app = express();
require('express-ws')(app);
const hbs = create({
    extname: '.hbs'
});
app.use(bodyParser.urlencoded({ extended: false }));

app.engine('.hbs', hbs.engine);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', '.hbs');
app.set('trust proxy', 1);
app.use(cookieSession({
    keys: process.env.COOKIE_KEYS.split(','),
}));

const subscribers = new Set();
const messages = [];

const broadcast = (message) => {
    for (const subscriber of subscribers) {
        subscriber.send(message);
    }
};

const renderPartial = (partial, context) => hbs.render(
    path.join(__dirname, 'views/partials', `${partial}.hbs`),
    context
);

app.use((req, res, next) => {
    if (!req.session.id) {
        req.session.id = nanoid();
    }
    next();
});

app.ws('/ws', (ws, req) => {
    subscribers.add(ws);
    ws.on('close', () => {
        subscribers.delete(ws);
    })
});

app.get('/', (req, res) => {
    res.render('index', { messages });
});

app.post('/new-message', async (req, res) => {
    const message = req.body.content;
    if (message.length < 1) {
        res.render('index', { error: 'Please enter a message.' });
        return;
    }

    const messageObject = {
        id: nanoid(),
        authorId: req.session.id,
        content: message,
        timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    };

    messages.push(messageObject);

    const messageString = await renderPartial(
        'message',
        { message: messageObject }
    );
    broadcast(messageString);

    if (messages.length > 5) {
        const oldestMessage = messages.shift();
        const deleteMessageString = await renderPartial(
            'remove-message',
            { id: oldestMessage.id }
        );
        broadcast(deleteMessageString);
    }

    res.render('index');
});

app.listen(process.env.PORT || 8888);

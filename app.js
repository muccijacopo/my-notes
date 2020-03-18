const express = require('express');
const exphbs = require('express-handlebars');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const passport = require('passport');

const {ensureAuthenticated} = require('./helpers/auth');

const app = express();

mongoose.connect('mongodb://localhost:27017/MyNotes', {useNewUrlParser: true})
    .then(() => {
        console.log("Database connesso.");
    })
    .catch(err => (err));

require('./models/note');
const Note = mongoose.model('Note');
require('./models/users');
const User = mongoose.model('User');

require('./config/passport')(passport);

// MIDDLEWARE per Handlebars
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

// Body-parser
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

app.use(methodOverride('_method'))


// MIDDLEWARE Express js session
app.use(session({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

// Variabili globali
app.use((req, res, next) => {
    res.locals.msg_success = req.flash('msg_success');
    res.locals.msg_err = req.flash('msg_err');
    res.locals.error = req.flash('error');
    res.locals.user = req.user;
    next();
});

const port = 3000;
app.listen(port, function () {
    console.log("Server attivo sullla porta " + port + ".");
});

app.get('/', function(req, res) {
    const titolo = "Benvenuto";
    res.render("index", {titolo: titolo});
});

app.get("/info", function(req, res) {
    res.render("info");
})

app.get("/note/add", ensureAuthenticated, function(req, res) {
    res.render('noteForm');
});

app.post("/note/add", ensureAuthenticated, function(req, res) {
    //res.send("Nota registrata.")
    //console.log(req.body);
    let errors = [];
    if(!req.body.title) {
        errors.push({text: 'Dai un titolo alla tua nota!'});
    }

    if(errors.length > 0) {
        res.render('noteForm', {
            errors: errors,
            titolo: req.body.titolo,
            testo: req.body.testo
        });
    } else {
        //res.send("Nota registrata");
        const newNote = {
            title: req.body.title,
            text: req.body.text,
            user: req.user.id
        }

        new Note(newNote)
        .save()
        .then((note) => {
            req.flash('msg_success', 'Nota aggiunta correttamente')
            res.redirect('/note/all');
        });
    }
});

app.get("/note/all", ensureAuthenticated, (req, res) => {
    Note.find({user: req.user.id})
    .sort({date: 'desc'})
    .then((notes) => {
        res.render('notes', {
            notes: notes
        });
    });
})

app.get('/note/edit/:id', ensureAuthenticated, (req, res) => {
    Note.findOne({
        _id: req.params.id
    })
    .then((note) => {
        if(note.user != req.user) {
            req.flash("msg_err", 'Non puoi accedere a questa pagina');
            res.redirect("/");
        }
        res.render('noteEditor', {
            note: note
        });
    });
});

app.post('/note/edit/:id', ensureAuthenticated, (req, res) => {
    Note.findOne({
        _id: req.params.id
    })
    .then((note) => {
        note.title = req.body.title;
        note.text = req.body.text;

        note.save(note)

        .then(note => {
            req.flash('msg_success', 'Nota modificata correttamente')
            res.redirect('/note/all');
        });
    });
});

app.delete('/note/delete/:id', ensureAuthenticated, (req, res) => {
    Note.remove({
        _id: req.params.id
    })
    .then(() => {
        req.flash('msg_success', 'Nota eliminata correttamente')
        res.redirect('/note/all');
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/signin', (req, res) => {
    res.render('signin');
});

app.post('/signin', (req, res) => {
    let errors = [];

    if(!req.body.name) {
        errors.push({text: 'Il nome è obbligatorio'});
    }

    if(!req.body.surname) {
        errors.push({text: 'Il cognome è obbligatorio'});
    }

    if(!req.body.email) {
        errors.push({text: 'L\'email è obbligatoria' });
    }

    if(req.body.password.length < 6) {
        errors.push({text: 'La password deve essere di almeno 6 caratteri!'});
    }

    if(req.body.password != req.body.confirmPwd) {
        errors.push({text: 'Le due password non coincidono'});
    }

    if(errors.length > 0) {
        res.render('signin', {
            errors: errors,
            name: req.body.name,
            surname: req.body.surname,
            email: req.body.email,
            password: req.body.password,
            confirmPwd: req.body.confirmPwd
        });
    } else {
        User.findOne({email: req.body.email})
        .then((user) => {
            if(user) {
                var text = 'Email già registrata';
                errors.push({text: text});
                res.render('signin', {
                    errors: errors,
                    name: req.body.name,
                    surname: req.body.surname,
                    email: req.body.email,
                    password: req.body.password,
                    confirmPwd: req.body.confirmPwd
                });
            } else {
                let newUser = new User({
                    name: req.body.name,
                    surname: req.body.surname,
                    email: req.body.email,
                    password: req.body.password
                });

                bcrypt.genSalt(10, function(err, salt) {
                    bcrypt.hash(newUser.password, salt, function(err, hash) {
                        if(err) throw err;
                        newUser.password = hash;
                        newUser.save()
                        .then((user) => {
                            req.flash('msg_success', 'La registrazione è stata completata con successo.');
                            res.redirect('/login');
                        })
                        .catch((err) => {
                            console.log(err);
                        });
                    });
                });
            }
        });
    }
});

app.post('/login', function(req, res, next) {
    //console.log('login');
    passport.authenticate('local', {
        successRedirect: '/note/all',
        failureRedirect: '/login',
        failureFlash: true 
    })(req, res, next);
});

app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
})
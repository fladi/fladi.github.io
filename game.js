$(document).ready(function () {
    /* Basis-URL für alles XMLHttpRequest-Aufrufe */
    let baseURL = "https://nowaunoweb.azurewebsites.net";

    /* Map zwischen Farbe der Karte und Bootstrap-Class */
    let colorMap = {
        Black: 'bg-secondary',
        Red: 'bg-danger',
        Blue: 'bg-primary',
        Green: 'bg-success',
        Yellow: 'bg-warning'
    };

    /* Häufiger referenzierte Elemente vorab suchen */
    let $topCard = $('#topCard');
    let $draw = $('#draw');
    let $colorPicker = $('#colorPicker');

    /* Globale Variablen */
    let game;
    let direction = 1;
    let players = {};
    let playerOrder;
    let currentPlayer;
    let playable = false;
    /* Für welche Values einer Karte muss ein Farbwähler angezeigt werden. */
    let colorPickerCards = [13, 14];
    /* Für welche Values einer Karte wird ein Spieler übersprungen und
    bekommt zusätzliche Handkarten. */
    let skipCards = [10, 13];
    /* Für welche Values einer Karte wird die Spielrichtung geändert. */
    let reverseCards = [12];
        
    let colorOrder = [
        'Red',
        'Yellow',
        'Green',
        'Blue',
        'Black',
    ];

    /* Spielernamen validieren: Keine leeren Fehler und eindeutige Werte */
    let validatePlayerNames = function (form) {
        let fields = $("input:text", form)
        let values = fields.map(function () {
            /* Funktion wird auf jedes Element angewandt und "return"-Wert wird in neue Liste geschrieben */
            return this.value;
        }).filter(function () {
            /* Elemente aus der Liste filtern (entfernen), die leere Strings 
            sind */
            return this.length > 0;
        }).get();
        /* Aus Liste der eingegebenen Werte ein Set erzeugen, damit Duplikate 
        eliminieren und Länge gegen Anzahl der Felder prüfen */
        return (new Set(values)).size == fields.length;
    };

    /* Modal-Fenster öffnen um Spielernamen abzufragen */
    $('#playerNames').modal();

    /* Event-Listener für "Taste hoch"-Event auf jedem Eingabefeld registrieren */
    $('#playerNamesForm').on('keyup', function (evt) {
        /* "Spiel starten"-Button aktivieren/deaktivieren, abhängig vom Ergebnis 
        der Validierung */
        $('button', evt.currentTarget).prop('disabled', !validatePlayerNames(evt.currentTarget));
    });

    /* Event-Listener für Abschicken des Formulars mit den Spielernamen 
    registrieren, startet das eigentliche Spiel. */
    $('#playerNamesForm').on('submit', function (evt) {

        /* Formular-Versand durch Webbrowser verhindern, nur eigene JS-Logik 
        ausführen. */
        evt.preventDefault();

        /* Alle "input"-Elemente inaktiv stellen um nachträgliche Bearbeitung 
        zu verhindern, dann alle eingegebenen Werte auslesen. */
        let names = $('input:text').prop('disabled', true).map(function () {
            return this.value;
        }).get();

        /* POST-Request zum starten des Spiels am API-Webserver schicken. 
        Spielernamen als JSON-Body schicken. */
        let request = $.ajax({
            url: baseURL + "/api/Game/Start",
            method: 'POST',
            data: JSON.stringify(names),
            contentType: 'application/json',
            dataType: 'json'
        });
        /* Request war erfolgreich, starte Spiel mit empfangenen Daten. 
        Modal wird ausgeblendet. */
        request.done(function (data) {
            console.log(data);
            $('#playerNames').modal('hide');
            initializeGame(data);
        });
        /* Request schlug fehl, keine weitere Aktion. Spieler kann Formular 
        erneut absenden. */
        request.fail(function (msg) {
            console.log("Error in request", msg);
        });

    });

    /* Funktion um übersprungenen Spieler zu ermitteln. */
    let getSkippedPlayer = function() {
        /* Suche die Position des aktuellen Spielers in der sortierten Liste
        aller Spielernamen. */
        let currentIndex = playerOrder.indexOf(currentPlayer);
        /* Errechne Index des übersprungenen Spielers anhand der aktuellen
        Spielrichtung (-1/+1). Modulo-Operation um Wrap-Around zu ermöglichen:
        4 % 4 = 0 (Beginnt Array von vorne zu lesen)
        */
        let newIndex = (currentIndex + direction) % playerOrder.length;
        /* Bei negativer Richtung, prüfen ob Index für übersprungenen Spieler
        negativ ist. Wenn ja, dann Anzahl der Spieler wieder hinzuzählen um in
        positiven Bereich zu kommen. */
        if (newIndex < 0) {
            newIndex = newIndex + playerOrder.length;
        }
        /* Spielernamen am Index des übersprungenen Spielers ausgeben. */
        return playerOrder[newIndex];
    }

    /* Aktualisieren des aktuell aktiven Spielers. */
    let updateCurrentPlayer = function (player, score) {
        /* Prüfen ob neuer Spieler sich vom aktuellen Spieler unterscheidet, 
        wenn wahr, dann keine Aktion. */
        if (player === currentPlayer) {
            console.log("Not updating current player, already set", player);
            return;
        }
        /* Neuen aktiven Spieler setzen. */
        currentPlayer = player;
        /* Alle Spieler durchlaufen, für alle inaktiven den Border entfernen, 
        der aktive Spieler erhält einen Border, der seine Handkarten hervorhebt. */
        Object.keys(players).forEach(function (name) {
            if (name === currentPlayer) {
                /* Aktiver Spieler. */
                players[name].addClass('border').addClass('border-primary');
            } else {
                /* Inaktiver Spieler. */
                players[name].removeClass('border').removeClass('border-primary');
            }
        });
        /* Aktiven Spieler in der Navigation aktualisieren. */
        $('#currentPlayer').text("Aktueller Spieler: " + currentPlayer);
        /* Punkte des aktiven Spielers mit den werten vom Request überschrieben. 
        Wir vertrauen hier dem Server. */
        $('.points', players[player]).text(score);
    }
    
    let sortCards = function(a, b) {
        let $a = $(a);
        let $b = $(b);
        let color = colorOrder.indexOf($a.data('Color')) - colorOrder.indexOf($b.data('Color'));
        if (color !== 0) {
            return color;
        }
        return parseInt($a.data('Value')) - parseInt($b.data('Value'));
    }

    /* Eine jQuery-Node erzeugen, die eine inaktive Karte repräsentiert. */
    let createCard = function (card) {
        /* Karten-Template anhand der ID suchen, Text auslesen und jQuery-Node 
        erzeugen. */
        let $card = $($('#tmplCard').text());
        /* Farb-Klasse anhand der Farb-Map zuweisen. */
        $card.addClass(colorMap[card.Color]);
        /* Value in Karte eintragen. */
        $('.card-title', $card).text(card.Value)
        /* Text in Karte eintragen. */
        $('.card-subtitle', $card).text(card.Text)
        $card.data('Color', card.Color);
        $card.data('Value', card.Value);
        return $card;
    };

    let shakeCard = function ($card) {
        $card.addClass('shake');
        setTimeout(function () {
            $card.removeClass('shake');
        }, 1000);
    }

    /* Ausgespielte Karte an den API-Webserver senden. */
    let sendCard = function (card, $card, wildColor) {
        /* Abhebe-Button inaktiv schalten, um Abheben wärhend des laufenden 
        Requests zu verhindern. */
        $draw.prop('disabled', true);
        console.log('Playing card', card, $card);
        /* URL für Request zusammen bauen. */
        let url = baseURL + '/api/game/playCard/' + game + '?value=' + card.Value + '&color=' + card.Color + '&wildColor=';
        /* Wenn Karte mit Farbwähler, dann gewählte Farbe an URL anhängen. */
        if (wildColor) {
            url = url + wildColor;
        }
        /* Request an API-Webserver senden um Karte auszuspielen. */
        let request = $.ajax({
            url: url,
            method: 'PUT',
            dataType: 'json'
        });
        /* Request war erfolgreich. */
        request.done(function (data) {
            /* Request abgeschlossen, Abhebe-Button wieder aktiv schalten. */
            $draw.prop('disabled', false);
            /* Prüfen ob Response eine Fehlermeldung enthält, z.B. falsche Farbe
            ausgespielt. Wenn Fehler, dann Abbruch und neue Karte des selben Spielers
            kann gespielt werden. */
            if (data.hasOwnProperty('error')) {
                console.log('Error at playing card', data.error);
                shakeCard($card);
                return;
            }
            /* Farbe der gespielten Karte auf Wert aus Farbwähler setzen, wenn Farbwahl 
            erfolgt ist. Dies ist eine Abkürzung um auf dem Ablage-Stapel der Karte die
            richtige Farbe zu geben. */
            if (wildColor) {
                card.Color = wildColor;
            }
            /* Karte am Ablagestapel entfernen und durch inaktive Kopie der gerade 
            gespielten Karte ersetzen. */
            $topCard.empty().append(createCard(card));
            /* Gespielte Karte aus DOM-Baum entfernen. */
            $card.remove();
            /* Wird für gespielte Karte die Spielrichtung geändert. */
            if (reverseCards.includes(card.Value)) {
                direction = direction * -1;
            }
            /* Wird für gespielte Karte ein Spieler übersprungen, der aber Karten
            heben musste. */
            if (skipCards.includes(card.Value)) {
                updatePlayerCards(getSkippedPlayer());
            }
            console.log("Played Card", data);
            /* Gespielte Karte war die letzte des aktuellen Spielers. Wir haben einen
            Gewinner. */
            if (data.Cards.length === 0) {
                players[data.Player].addClass('bg-success');
            }
            /* Punkte des Spielers auslesen, der gerade gespielt hat. */
            let $points = $('.points', players[currentPlayer]);
            /* Wert der gespielten Karte vom Score des Spielers abziehen. */
            let score = $points.text() - card.Score;
            /* Neuen Score in Anzeigebereich des Spielers schreiben. */
            $points.text(score);
            /* Aktuellen Spieler auf von API-Webserver genannten Spieler setzen. */
            updateCurrentPlayer(data.Player, data.Score);
            playable = true;
        });
        /* Request schlug fehl. */
        request.fail(function (msg) {
            console.log("Server denied card", card, msg);
            shakeCard($card);
            /* Abhebe-Button wieder aktivieren. */
            $draw.prop('disabled', false);
        });
    }

    /* Eine spielbare KArte mit Logik aus inaktiver Karte erzeugen. */
    let createPlayableCard = function (card, player) {
        /* Inaktive Karte erzeugen. */
        let $card = createCard(card);
        /* Click-Event-Listener auf die Karte hängen. */
        $card.on('click', function (evt) {
            /* Überprüfen, ob KArte überhaupt dem aktiven Spieler gehört. 
            Wenn wahr, dann keine weitere Aktion. */
            if (player !== currentPlayer) {
                shakeCard($card);
                return;
            }
            if (!playable) {
                return;
            }
            playable = false;
            /* Prüfen, ob Karte einen Farbwähler anzeigen muss. */
            if (colorPickerCards.includes(card.Value)) {
                /* Click-Event-Handler auf alle Farb-Buttons im Farbwahl-Modal
                registrieren. */
                $('button', $colorPicker).on('click', function (evt) {
                    /* Click-Event-Handler wieder von jedem Farb-Wahl-Button entfernen. */
                    $('button', $colorPicker).off('click');
                    /* Farbwahl-Modal Wieder ausblenden. */
                    $colorPicker.modal('hide');
                    /* Gespielte Karte mit ausgewählter Farbe absenden.
                    Farbe wird über "data-color"-Attribut vom button-Element augelesen. */
                    sendCard(card, $card, $(evt.currentTarget).data('color'));
                });
                /* Farbwähler anzeigen. */
                $colorPicker.modal('show');
            } else {
                /* Gespielte Karte an den API-Webserver senden. */
                sendCard(card, $card);
            }

        });
        return $card;
    };

    /* Alle Spielkarten eines Spielers neu vom API-Webserver abrufen und 
    neu anzeigen. */
    let updatePlayerCards = function(player) {
        let request = $.ajax({
            url: baseURL + '/api/Game/GetCards/' + game + '?playerName=' + player,
            method: 'GET',
            dataType: 'json'
        });
        request.done(function(data) {
            /* Den HTML-Bereich auswählen, in dem die Spielkarten des Spielers
            angezeigt werden. */
            let $deck = $('.deck', players[player]);
            /* Spielkarten leeren. */
            $deck.empty();
            /* Für jede empfangene Karte eine neue spielbare Karte erzeugen und dem
            Spieler anhängen. */
            data.Cards.forEach(function(card) {
                let $card = createPlayableCard(card, player);
                $deck.append($card);
            });
        });
        request.fail(function(msg) {
            console.error(msg);
        });
    };

    /* Spieler aus den vom API-Webserver empfangenen Daten erzeugen. */
    let createPlayer = function (player) {
        /* Spieler-Template anhand der ID suchen, Text auslesen und jQuery-Node 
        erzeugen. */
        let $player = $($('#tmplPlayer').text());
        /* Name des Spielers einbauen. */
        $('.card-title', $player).text(player.Player);
        /* Bereich im Spieler-HTML suchen, in dem seine Karten dargestellt werden
        sollen. */
        let $deck = $('.deck', $player);
        /* Für jede empfangene Karte des Spielers eine neue spielbare Karte erzeugen 
        und im Spieler-Bereich einbinden. */
        player.Cards.forEach(function (card) {
            let $card = createPlayableCard(card, player.Player);
            $deck.append($card);
        });
        /* Punkte des Spielers anzeigen. */
        $('.points', $player).text(player.Score);
        return $player;
    };

    /* Spielfeld initialisieren, anhand der vom API-Webserver empfangenen Daten. */
    let initializeGame = function (data) {
        /* Die empfangene Spiel-ID in der globalen Variable speichern. */
        game = data.Id;
        /* HTML-Bereich für Spielfeld suchen. */
        let $board = $('#board');
        /* Abhebe-Button mit Click-Event-Listener verknüpfen. */
        $draw.on('click', function (evt) {
            playable = false;
            /* Abhebe-Button inaktiv schalten, um Abheben während des laufenden 
            Requests zu verhindern. */
            $draw.prop('disabled', true);
            /* Wenn Abhebe-Button geklickt, dann Request zum Abheben einer Karte
            absenden. */
            let request = $.ajax({
                url: baseURL + '/api/Game/DrawCard/' + game,
                method: 'PUT'
            });
            /* Request zum Abheben war erfolgreich. */
            request.done(function (data) {
                playable = true;
                console.log('Draw card', data);
                /* Request ist fertig, Abhebe-Button wieder aktivieren. */
                $draw.prop('disabled', false);
                /* Erzeuge spielbare Karte aus epmfangenen Daten. */
                let $card = createPlayableCard(data.Card, data.Player);
                /* Neue Karte im Spielbereich des Spielers anfügen. */
                let $deck = $('.deck', players[data.Player]);
                $deck.append($card);
                let sortedCards = $deck.children().get().sort(sortCards);
                $deck.empty();
                $deck.append(sortedCards);



                /* Aktuellen Spieler auf von API-Webserver genannten Spieler setzen. */
                updateCurrentPlayer(data.NextPlayer);
            });
            /* Request schlug fehl. Keine Aktion ausführen. */
            request.fail(function (msg) {
                playable = true;
                /* Abhebe-Button wieder aktivieren .*/
                $draw.prop('disabled', false);
                console.log('Error drawing card', msg);
            });
        });

        /* Neue inaktive Karte aus empfangenen Daten erzeugen und auf 
        Ablage-Stapel legen. */
        $topCard.append(createCard(data.TopCard));
        /* Für alle Spieler Spielfeld initialisieren. */
        data.Players.forEach(function (player) {
            console.log(player);
            let $player = createPlayer(player);
            $('#playerList').before($player);
            players[player.Player] = $player;
        });
        playerOrder = data.Players.map(function (player) {
            return player.Player;
        });
        /* Aktiven Spieler auf ersten Spieler setzen. */
        updateCurrentPlayer(data.NextPlayer);
        /* Spielfeld anzeigen. */
        $board.removeClass('invisible');
        playable = true;
    };

});

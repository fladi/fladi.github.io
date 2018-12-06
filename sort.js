let colorOrder = [
    'Red',
    'Yellow',
    'Green',
    'Blue',
];

let sortCards = function(a, b) {
    let color = colorOrder.indexOf(a.Color) - colorOrder.indexOf(b.Color);
    if (color !== 0) {
        return color;
    }
    return a.Value - b.Value;
}

cardDeck.sort(sortCards);
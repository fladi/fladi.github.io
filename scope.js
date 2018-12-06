var a = "bla";
var b = function() {
    var x = a;
    return function() {
        console.log(x);
        console.log(a);
    };
    
}();
a = "foo";
x = "xxx";
b();
// move YT Video to target
// Trigger Required: "Package Finished"
// Forum Topic: https://board.jdownloader.org/showpost.php?p=386822&postcount=18

var links = package.getDownloadLinks();
package.setComment("Copy Started...")

var success = true;

for (i = 0; i < links.length; i++) {
    var link = links[i];
    var file = link.getDownloadPath();
    var pos = file.indexOf('/jdyt/');
    if (pos >= 0) {
        if(file.substr(file.length-4).toLowerCase() == ".m4a") {
            link.setComment("m4a file. ERROR");
            package.setComment("Copy FAILED!");
            success = false;
            continue
        }
        link.setComment("copying...")
        callSync('/Users/shk/bin/jdyt2target.bash', file.substr(0, pos + 6), file.substr(pos + 6));
        var myFilePath = getPath(file);
        if (myFilePath.exists()) {
            link.setComment("Copy FAILED!");
            package.setComment("Copy FAILED!");
            success = false;
            continue
        }
        link.setComment("copied!");
    }
}
if (success) {
    package.setComment("copied!");
}
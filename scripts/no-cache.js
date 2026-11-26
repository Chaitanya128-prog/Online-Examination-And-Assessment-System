// json-server middleware: stop the browser from caching API responses,
// so every page always shows the latest data from db.json.
module.exports = function (req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
};

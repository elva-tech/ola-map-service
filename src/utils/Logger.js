class Logger {
  static info(message, meta = {}) {
    console.log(
      JSON.stringify({
        level: "info",
        message,
        meta,
        timestamp: new Date().toISOString()
      })
    );
  }

  static error(message, meta = {}) {
    console.error(
      JSON.stringify({
        level: "error",
        message,
        meta,
        timestamp: new Date().toISOString()
      })
    );
  }
}

module.exports = Logger;

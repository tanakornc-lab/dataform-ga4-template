function surrogate_key(...args) {
  return `CAST(FARM_FINGERPRINT(CONCAT(${args.map(a => `CAST(${a} AS STRING)`).join(", '|', ")})) AS STRING)`;
}

module.exports = { surrogate_key };

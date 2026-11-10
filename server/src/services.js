"use strict";

const configLoader = require("./config");
const database = require("./db");
const storage = require("./storage");

async function createServices(env = process.env) {
  const config = configLoader.load(env);
  const db = await database.open(config);
  const store = storage.create(config);
  return { config, db, storage: store };
}

module.exports = { createServices };

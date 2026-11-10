"use strict";

const express = require("express");
const { notFound, h } = require("../http");

module.exports = function templateRoutes(ctx) {
  const r = express.Router();

  r.get("/", h(async (req, res) => {
    res.json({ templates: await ctx.templates.summaries() });
  }));

  r.get("/:id", h(async (req, res) => {
    const t = await ctx.templates.get(req.params.id);
    if (!t) throw notFound("Template not found");
    res.json({ template: t });
  }));

  return r;
};

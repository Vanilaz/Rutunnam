// @ts-check
const { publicConfig } = require("../lib/layers");
const { rejectUnsafeMethod } = require("../lib/http");

/** Which optional layers this deployment can show. Never includes server-only secrets. */
/** @param {import("../lib/http").Req} req @param {import("../lib/http").Res} res */
module.exports = async function handler(req, res) {
  if (rejectUnsafeMethod(req, res)) return;
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
  return res.status(200).json(publicConfig(process.env));
};

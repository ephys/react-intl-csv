#!/usr/bin/env node

import { program } from 'commander';
import csv2json from 'csvtojson';
import fs from 'fs/promises';
import { parse as json2csv } from 'json2csv';
import jsonStringify from 'json-stable-stringify';
import path from 'path';

const pkg = JSON.parse(await fs.readFile(
  new URL('../package.json', import.meta.url),
  'utf-8',
));

const idKeys = ['id', 'key', 'hash'];

program
  .version(pkg.version)
  .usage('<from> [options]')
  .option('--to-csv <to>', String)
  .option('--to-json <to>', Boolean)
  .parse(process.argv);

const options = program.opts();

if (Boolean(options.toJson) === Boolean(options.toCsv)) {
  console.error('Specify --to-csv OR --to-json');
}

const from = program.args[0];

if (options.toCsv) {
  await convertToCsv(from, options.toCsv);
}

if (options.toJson) {
  await convertToJson(from, options.toJson);
}

async function convertToJson(from, to) {

  const rows = await csv2json().fromFile(from);

  if (rows.length === 0) {
    throw new Error('Empty CSV');
  }

  const keys = Object.keys(rows[0]);
  const localeKeys = keys.filter(key => !idKeys.includes(key) && !key.startsWith('_'))
  const idKey = keys.find(key => idKeys.includes(key) || (key.startsWith('_') && idKeys.includes(key.substring(1))))

  const translationsByLocale = Object.create(null);
  for (const locale of localeKeys) {
    translationsByLocale[locale] = Object.create(null);
  }

  for (const row of rows) {
    for (const locale of localeKeys) {
      const rowId = row[idKey];
      translationsByLocale[locale][rowId] = row[locale].trim();
    }
  }

  await Promise.all(localeKeys.map(locale => {
    const fileName = path.join(to, `${locale}.json`);

    return fs.writeFile(fileName, jsonStringify(translationsByLocale[locale], { space: 2 }) + '\n');
  }));
}

async function convertToCsv(from, to) {
  const jsonFiles = await fs.readdir(from);
  if (jsonFiles.length === 0) {
    console.warn(`No locale file fround in ${from}`);
    return;
  }

  const translationsByLocale = {};
  const translationKeys = new Set();
  await Promise.all(jsonFiles.map(async file => {
    if (!file.match(/\.json$/)) {
      console.debug(`File ${file} does not end in .json, skipping`);
      return;
    }

    let translations;

    const filePath = path.join(from, file);
    try {
      translations = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch (e) {
      console.error(`Error while parsing file ${filePath}.`);
      throw e;
    }

    const locale = getLocaleFromFileName(file);
    translationsByLocale[locale] = translations;

    for (const translationKey of Object.keys(translations)) {
      translationKeys.add(translationKey);
    }
  }));

  const locales = Object.keys(translationsByLocale);

  const json = [];
  for (const translationKey of translationKeys) {
    const row = {
      key: translationKey,
    };

    for (const locale of locales) {
      row[locale] = translationsByLocale[locale][translationKey];
    }

    json.push(row);
  }

  await fs.writeFile(to, json2csv(json));
}

function getLocaleFromFileName(file) {
  const ext = path.extname(file);

  return file.substr(0, file.length - ext.length);
}

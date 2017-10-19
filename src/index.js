#!/usr/bin/env node

import path from 'path';
import fs from 'mz/fs';
import fsExtra from 'fs-extra';
import commander from 'commander';
import json2csv from 'json2csv';
import csv2json from 'csvtojson';
import pkg from '../package.json';

commander
  .version(pkg.version)
  .usage('<from> [options]')
  .option('--to-csv <to>', String)
  .option('--to-json <to>', Boolean)
  .parse(process.argv);

if (Boolean(commander.toJson) === Boolean(commander.toCsv)) {
  console.error('Specify --to-csv OR --to-json');
}

const from = commander.args[0];

if (commander.toCsv) {
  convertToCsv(from, commander.toCsv);
}

if (commander.toJson) {
  convertToJson(from, commander.toJson);
}

function convertToJson(from, to) {

  const translationsByLocale = {};

  return new Promise((resolve, reject) => {
    csv2json()
      .fromFile(from)
      .on('header', (header) => {
        for (const locale of header) {
          if (locale === 'key') {
            continue;
          }

          translationsByLocale[locale] = {};
        }
      })
      .on('json', (jsonObj) => {
        const key = jsonObj.key;

        for (const locale of Object.keys(jsonObj)) {
          if (locale === 'key') {
            continue;
          }

          translationsByLocale[locale][key] = jsonObj[locale];
        }
      })
      .on('done', async (error) => {
        if (error) {
          return void reject(error);
        }

        await fsExtra.ensureDir(to);

        const locales = Object.keys(translationsByLocale);

        await Promise.all(locales.map(async locale => {
          const fileName = path.join(to, `${locale}.json`);

          await fs.writeFile(fileName, JSON.stringify(translationsByLocale[locale], null, 2));
        }));

        resolve();
      });
  });
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
      translations = JSON.parse(await fs.readFile(filePath));
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

  await fs.writeFile(to, json2csv({ data: json }));
}

function getLocaleFromFileName(file) {
  const ext = path.extname(file);

  return file.substr(0, file.length - ext.length);
}

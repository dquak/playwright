/**
 * Copyright 2018 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Route, Request } from 'playwright-core';
import { expect, test as base } from './pageTest';
import fs from 'fs';
import path from 'path';

const it = base.extend<{
  // We access test servers at 10.0.2.2 from inside the browser on Android,
  // which is actually forwarded to the desktop localhost.
  // To use request such an url with apiRequestContext on the desktop, we need to change it back to localhost.
  rewriteAndroidLoopbackURL(url: string): string
      }>({
        rewriteAndroidLoopbackURL: ({ isAndroid }, use) => use(givenURL => {
          if (!isAndroid)
            return givenURL;
          const requestURL = new URL(givenURL);
          requestURL.hostname = 'localhost';
          return requestURL.toString();
        })
      });

it('should fulfill intercepted response', async ({ page, server, isElectron, isAndroid }) => {
  it.fixme(isElectron, 'error: Browser context management is not supported.');
  it.skip(isAndroid, 'The internal Android localhost (10.0.0.2) != the localhost on the host');
  await page.route('**/*', async route => {
    const response = await page.request.fetch(route.request());
    await route.fulfill({
      response,
      status: 201,
      headers: {
        foo: 'bar'
      },
      contentType: 'text/plain',
      body: 'Yo, page!'
    });
  });
  const response = await page.goto(server.PREFIX + '/empty.html');
  expect(response.status()).toBe(201);
  expect(response.headers().foo).toBe('bar');
  expect(response.headers()['content-type']).toBe('text/plain');
  expect(await page.evaluate(() => document.body.textContent)).toBe('Yo, page!');
});

it('should fulfill response with empty body', async ({ page, server, isAndroid, browserName, browserMajorVersion }) => {
  it.skip(browserName === 'chromium' && browserMajorVersion <= 91, 'Fails in Electron that uses old Chromium');
  it.skip(isAndroid, 'The internal Android localhost (10.0.0.2) != the localhost on the host');
  await page.route('**/*', async route => {
    const response = await page.request.fetch(route.request());
    await route.fulfill({
      response,
      status: 201,
      body: ''
    });
  });
  const response = await page.goto(server.PREFIX + '/title.html');
  expect(response.status()).toBe(201);
  expect(await response.text()).toBe('');
});

it('should override with defaults when intercepted response not provided', async ({ page, server, browserName, isElectron, isAndroid }) => {
  it.fixme(isElectron, 'error: Browser context management is not supported.');
  it.skip(isAndroid, 'The internal Android localhost (10.0.0.2) != the localhost on the host');
  server.setRoute('/empty.html', (req, res) => {
    res.setHeader('foo', 'bar');
    res.end('my content');
  });
  await page.route('**/*', async route => {
    await page.request.fetch(route.request());
    await route.fulfill({
      status: 201,
    });
  });
  const response = await page.goto(server.EMPTY_PAGE);
  expect(response.status()).toBe(201);
  expect(await response.text()).toBe('');
  if (browserName === 'webkit')
    expect(response.headers()).toEqual({ 'content-type': 'text/plain' });
  else
    expect(response.headers()).toEqual({ });
});

it('should fulfill with any response', async ({ page, server, isElectron, rewriteAndroidLoopbackURL }) => {
  it.fixme(isElectron, 'error: Browser context management is not supported.');

  server.setRoute('/sample', (req, res) => {
    res.setHeader('foo', 'bar');
    res.end('Woo-hoo');
  });
  const sampleResponse = await page.request.get(rewriteAndroidLoopbackURL(`${server.PREFIX}/sample`));

  await page.route('**/*', async route => {
    await route.fulfill({
      response: sampleResponse,
      status: 201,
      contentType: 'text/plain'
    });
  });
  const response = await page.goto(server.EMPTY_PAGE);
  expect(response.status()).toBe(201);
  expect(await response.text()).toBe('Woo-hoo');
  expect(response.headers()['foo']).toBe('bar');
});

it('should support fulfill after intercept', async ({ page, server, isElectron, isAndroid }) => {
  it.fixme(isElectron, 'error: Browser context management is not supported.');
  it.skip(isAndroid, 'The internal Android localhost (10.0.0.2) != the localhost on the host');
  const requestPromise = server.waitForRequest('/title.html');
  await page.route('**', async route => {
    const response = await page.request.fetch(route.request());
    await route.fulfill({ response });
  });
  const response = await page.goto(server.PREFIX + '/title.html');
  const request = await requestPromise;
  expect(request.url).toBe('/title.html');
  const original = await fs.promises.readFile(path.join(__dirname, '..', 'assets', 'title.html'), 'utf8');
  expect(await response.text()).toBe(original);
});

it('should give access to the intercepted response', async ({ page, server, isElectron, isAndroid }) => {
  it.fixme(isElectron, 'error: Browser context management is not supported.');
  it.skip(isAndroid, 'The internal Android localhost (10.0.0.2) != the localhost on the host');
  await page.goto(server.EMPTY_PAGE);

  let routeCallback;
  const routePromise = new Promise<Route>(f => routeCallback = f);
  await page.route('**/title.html', routeCallback);

  const evalPromise = page.evaluate(url => fetch(url), server.PREFIX + '/title.html');

  const route = await routePromise;
  const response = await page.request.fetch(route.request());

  expect(response.status()).toBe(200);
  expect(response.statusText()).toBe('OK');
  expect(response.ok()).toBeTruthy();
  expect(response.url().endsWith('/title.html')).toBe(true);
  expect(response.headers()['content-type']).toBe('text/html; charset=utf-8');
  expect(response.headersArray().filter(({ name }) => name.toLowerCase() === 'content-type')).toEqual([{ name: 'Content-Type', value: 'text/html; charset=utf-8' }]);

  await Promise.all([route.fulfill({ response }), evalPromise]);
});

it('should give access to the intercepted response body', async ({ page, server, isElectron, isAndroid }) => {
  it.fixme(isElectron, 'error: Browser context management is not supported.');
  it.skip(isAndroid, 'The internal Android localhost (10.0.0.2) != the localhost on the host');
  await page.goto(server.EMPTY_PAGE);

  let routeCallback;
  const routePromise = new Promise<Route>(f => routeCallback = f);
  await page.route('**/simple.json', routeCallback);

  const evalPromise = page.evaluate(url => fetch(url), server.PREFIX + '/simple.json').catch(() => {});

  const route = await routePromise;
  const response = await page.request.fetch(route.request());

  expect(await response.text()).toBe('{"foo": "bar"}\n');

  await Promise.all([route.fulfill({ response }), evalPromise]);
});

it('should intercept multipart/form-data request body', async ({ page, server, asset, browserName }) => {
  it.info().annotations.push({ type: 'issue', description: 'https://github.com/microsoft/playwright/issues/14624' });
  it.fail(browserName !== 'firefox');
  await page.goto(server.PREFIX + '/input/fileupload.html');
  const filePath = path.relative(process.cwd(), asset('file-to-upload.txt'));
  await page.locator('input[type=file]').setInputFiles(filePath);
  const requestPromise = new Promise<Request>(async fulfill => {
    await page.route('**/upload', route => {
      fulfill(route.request());
    });
  });
  const [request] = await Promise.all([
    requestPromise,
    page.click('input[type=submit]', { noWaitAfter: true })
  ]);
  expect(request.method()).toBe('POST');
  expect(request.postData()).toContain(fs.readFileSync(filePath, 'utf8'));
});
// page.js — what happens on the page: log in → zoom into the book → show the pages.
import { loadScene, playIntro } from './scene.js';

const sceneReady = loadScene();   // start loading the 3D models right away (behind the blur)
const login = document.querySelector('#login');
const book = document.querySelector('#book');

login.addEventListener('submit', async (event) => {
  event.preventDefault();         // accounts are not checked yet: any click starts
  document.body.classList.add('started');   // CSS removes the blur and hides the card
  await sceneReady;
  await playIntro();              // zoom + book opening
  book.hidden = false;            // CSS makes the two pages fade in
});

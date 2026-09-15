import { render } from 'preact';
import { App } from './app.jsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './style.css';

render(<App />, document.getElementById('app'));

// App entry. Android Auto support must load before the router: when the car starts the app, React runs
// headless (no screen), so nothing under src/app is rendered, but requests from the car still need a listener.
import './src/core/auto';
import 'expo-router/entry';

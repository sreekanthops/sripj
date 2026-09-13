// gesture-handler MUST be the first import for react-navigation/stack to work
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);

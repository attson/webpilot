import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import HomeDemo from './components/HomeDemo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout() {
    // Swap the hero mockup for the running demo — same slot, same position,
    // but the thing on the right is now real rather than a drawing of it.
    return h(DefaultTheme.Layout, null, {
      'home-hero-image': () => h(HomeDemo)
    });
  }
};

import { createApp } from 'vue'
import App from './App.vue'

// After a Nextcloud app update, hashed chunk files from the previous release
// no longer exist. If the browser has cached the old entry JS, dynamic imports
// will 404 and throw ChunkLoadError, leaving the page unstyled/unmounted.
// Force a reload so the browser fetches the new entry with updated chunk URLs.
window.addEventListener('unhandledrejection', (event) => {
	if (event.reason?.name === 'ChunkLoadError') {
		window.location.reload()
	}
})

const app = createApp(App)
app.mount('#weekplanner')

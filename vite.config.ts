/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createAppConfig } from '@nextcloud/vite-config'
import path from 'path'

const isProduction = process.env.NODE_ENV === 'production'

export default createAppConfig({
	main: path.join(__dirname, 'src', 'main.ts'),
}, {
	minify: isProduction,
	// create REUSE compliant license information for compiled assets
	extractLicenseInformation: {
		includeSourceMaps: true,
	},
	// disable BOM because we already have the `.license` files
	thirdPartyLicense: false,
	// ensure that every JS entry point has a matching CSS file
	createEmptyCSSEntryPoints: true,
	// Make sure we also clear the CSS directory
	emptyOutputDirectory: {
		additionalDirectories: ['css'],
	},
})
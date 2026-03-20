module.exports = {
	extends: [
		'@nextcloud/eslint-config/vue3',
	],
	rules: {
		'jsdoc/require-jsdoc': 'off',
		'vue/first-attribute-linebreak': 'off',
	},
	overrides: [
		{
			files: ['src/**/__tests__/**/*.ts'],
			rules: {
				'n/no-unpublished-import': 'off',
			},
		},
	],
}

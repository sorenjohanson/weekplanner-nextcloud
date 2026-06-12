import { recommended } from '@nextcloud/eslint-config'

export default [
    ...recommended,
    {
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'vue/first-attribute-linebreak': 'off',
	    'import-extensions/extensions': 'off'
        },
    },
    {
        files: ['src/**/__tests__/**/*.ts'],
        rules: {
            'n/no-unpublished-import': 'off',
        },
    },
]

import { resolve } from 'pathe'
import { addComponent, addImportsSources, addPlugin, addTemplate, defineNuxtModule, directoryToURL } from '@nuxt/kit'
import type { NuxtOptions } from '@nuxt/schema'
import { resolveModulePath } from 'exsolve'
import { distDir } from '../dirs'

const components = ['NoScript', 'Link', 'Base', 'Title', 'Meta', 'Style', 'Head', 'Html', 'Body']

export default defineNuxtModule<NuxtOptions['unhead']>({
  meta: {
    name: 'nuxt:meta',
    configKey: 'unhead',
  },
  setup (options, nuxt) {
    const runtimeDir = resolve(distDir, 'head/runtime')

    // Transpile @unhead/vue
    nuxt.options.build.transpile.push('@unhead/vue')

    // Register components
    const componentsPath = resolve(runtimeDir, 'components')
    for (const componentName of components) {
      addComponent({
        name: componentName,
        filePath: componentsPath,
        export: componentName,
        // built-in that we do not expect the user to override
        priority: 10,
        // kebab case version of these tags is not valid
        kebabName: componentName,
      })
    }

    // allow @unhead/vue server composables to be tree-shaken from the client bundle
    if (!nuxt.options.dev) {
      nuxt.options.optimization.treeShake.composables.client['@unhead/vue'] = [
        'useServerHead', 'useServerSeoMeta', 'useServerHeadSafe',
      ]
    }

    addImportsSources({
      from: '@unhead/vue',
      // hard-coded for now we so don't support auto-imports on the deprecated composables
      imports: [
        'injectHead',
        'useHead',
        'useSeoMeta',
        'useHeadSafe',
        'useServerHead',
        'useServerSeoMeta',
        'useServerHeadSafe',
      ],
    })

    // Opt-out feature allowing dependencies using @vueuse/head to work
    const importPaths = nuxt.options.modulesDir.map(d => directoryToURL(d))
    const unheadVue = resolveModulePath('@unhead/vue', { try: true, from: importPaths }) || '@unhead/vue'

    addTemplate({
      filename: 'unhead-plugins.mjs',
      getContents () {
        if (!nuxt.options.experimental.headNext) {
          return 'export default []'
        }
        return `import { CapoPlugin } from ${JSON.stringify(unheadVue)};
export default import.meta.server ? [CapoPlugin({ track: true })] : [];`
      },
    })

    addTemplate({
      filename: 'unhead.config.mjs',
      getContents () {
        return [
          `export const renderSSRHeadOptions = ${JSON.stringify(options.renderSSRHeadOptions || {})}`,
        ].join('\n')
      },
    })

    // template is only exposed in nuxt context, expose in nitro context as well
    nuxt.hooks.hook('nitro:config', (config) => {
      config.virtual!['#internal/unhead-plugins.mjs'] = () => nuxt.vfs['#build/unhead-plugins.mjs']
      config.virtual!['#internal/unhead.config.mjs'] = () => nuxt.vfs['#build/unhead.config.mjs']
    })

    // Add library-specific plugin
    addPlugin({ src: resolve(runtimeDir, 'plugins/unhead') })
  },
})

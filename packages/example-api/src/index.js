import fs from 'fs'
import { promisify } from 'util'
import elasticsearch from 'elasticsearch'
import makeSchema from '@arranger/schema'
import server from '@arranger/server'
import { getNestedFields } from '@arranger/mapping-utils'

let writeFile = promisify(fs.writeFile)

let fetchMappings = ({ types, es }) => {
  return Promise.all(
    types.map(([, { index, es_type }]) =>
      es.indices.getMapping({
        index,
        type: es_type,
      }),
    ),
  )
}

let writeMappingsToFiles = async ({ types, mappings }) =>
  types.forEach(
    async ([type], i) =>
      await writeFile(
        mappingFolder(type),
        JSON.stringify(Object.values(mappings[i])[0].mappings, null, 2),
      ),
  )

let addMappingsToTypes = ({ types, mappings }) => {
  return types.map(([key, type], i) => {
    let mapping = Object.values(mappings[i])[0].mappings[type.es_type]
      .properties

    return [
      key,
      {
        ...type,
        mapping,
        nested_fields: getNestedFields(mapping),
      },
    ]
  })
}

let main = async () => {
  if (process.env.WITH_ES) {
    let esconfig = {
      host: process.env.ES_HOST,
    }

    if (process.env.ES_TRACE) esconfig.log = process.env.ES_TRACE

    let es = new elasticsearch.Client(esconfig)

    es
      .ping({
        requestTimeout: 1000,
      })
      .then(async () => {
        // let types = Object.entries(global.config.ES_TYPES)
        let ES_TYPES = {
          annotations: {
            index: 'anns',
            es_type: 'anns',
            name: 'Annotation',
          },
        }
        let types = Object.entries(ES_TYPES)
        let mappings = await fetchMappings({ types, es })
        let typesWithMappings = addMappingsToTypes({ types, mappings })
        console.log(1111, typesWithMappings)
        let schema = makeSchema({ types: typesWithMappings })
        server({ schema, context: { es } })
      })
      .catch(err => {
        console.log(err)
        // server({ schema })
      })
  } else {
    let schema = makeSchema({ mock: true })
    server({ schema })
  }
}

main()

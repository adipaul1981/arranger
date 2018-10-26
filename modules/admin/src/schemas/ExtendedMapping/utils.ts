import { Client } from 'elasticsearch';
import { extendMapping } from '@arranger/mapping-utils/dist';
import { getEsMapping } from '../../services/elasticsearch';
import { UserInputError } from 'apollo-server';
import { EsIndexLocation } from '../types';
import {
  getProjectMetadataEsLocation,
  getProjectStorageMetadata,
} from '../IndexSchema/utils';
import {
  I_ExtendedFieldsMappingsQueryArgs,
  I_GqlExtendedFieldMapping,
  I_UpdateExtendedMappingMutationArgs,
} from './types';

export const createExtendedMapping = (es: Client) => async ({
  esIndex,
  esType,
}: EsIndexLocation): Promise<I_GqlExtendedFieldMapping[]> => {
  let extendedMappings: I_GqlExtendedFieldMapping[] = [];
  try {
    const esMapping = await getEsMapping(es)({ esIndex, esType });
    const indexName = Object.keys(esMapping)[0]; //assumes all mappings returned are the same
    const esMappingProperties =
      esMapping[indexName].mappings[esType].properties;
    extendedMappings = extendMapping(
      esMappingProperties,
    ) as I_GqlExtendedFieldMapping[];
  } catch (err) {
    console.log('error: ', err);
    throw err;
  }
  return extendedMappings;
};

export const getExtendedMapping = (es: Client) => async ({
  projectId,
  graphqlField,
  field,
}: I_ExtendedFieldsMappingsQueryArgs): Promise<I_GqlExtendedFieldMapping[]> => {
  const indexMetadata = (await getProjectStorageMetadata(es)(projectId)).find(
    metaData => metaData.name === graphqlField,
  );
  if (indexMetadata) {
    if (field) {
      return indexMetadata.config.extended.filter(ex => field === ex.field);
    } else {
      return indexMetadata.config.extended;
    }
  } else {
    throw new UserInputError(
      `no index found under name ${graphqlField} for project ${projectId}`,
    );
  }
};

export const updateFieldExtendedMapping = (es: Client) => async ({
  field: mutatedField,
  graphqlField,
  projectId,
  extendedFieldMappingInput,
}: I_UpdateExtendedMappingMutationArgs): Promise<I_GqlExtendedFieldMapping> => {
  const currentIndexMetadata = (await getProjectStorageMetadata(es)(
    projectId,
  )).find(metaData => metaData.name === graphqlField);

  if (currentIndexMetadata) {
    const indexExtendedMappingFields = await getExtendedMapping(es)({
      projectId,
      graphqlField,
    });

    const newIndexExtendedMappingFields: I_GqlExtendedFieldMapping[] = indexExtendedMappingFields.map(
      field =>
        (field.field as string) === mutatedField
          ? { ...field, ...extendedFieldMappingInput }
          : field,
    );

    await es.update({
      ...getProjectMetadataEsLocation(projectId),
      id: currentIndexMetadata.index,
      body: {
        doc: {
          config: {
            extended: newIndexExtendedMappingFields,
          },
        },
      },
    });

    return newIndexExtendedMappingFields.find(
      field => field.field === mutatedField,
    );
  } else {
    throw new UserInputError(
      `no index found under name ${graphqlField} for project ${projectId}`,
    );
  }
};

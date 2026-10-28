import type { AggregateOptions, Attributes, FindOptions, literal, Model, ModelStatic } from 'sequelize';

// Sequelize 6 admite includes al agregar; AggregateOptions no declara esa opción.
export function sumIncluding<M extends Model>(model: ModelStatic<M>, field: keyof Attributes<M>, options: AggregateOptions<number, Attributes<M>> & Pick<FindOptions<Attributes<M>>, 'include'>) {
  return model.sum(field, options);
}

// QueryGenerator de Sequelize 6 admite Literal en GROUP BY aunque GroupOption lo omite.
export function findAllGrouped<M extends Model>(model: ModelStatic<M>, input: Omit<FindOptions<Attributes<M>>, 'group'> & { group: ReturnType<typeof literal>[] }) {
  const { group, ...rest } = input;
  const options: FindOptions<Attributes<M>> = rest;
  Reflect.set(options, 'group', group);
  return model.findAll(options);
}

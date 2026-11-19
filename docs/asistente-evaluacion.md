# Evaluación del clasificador de intención

Generado por `npm run asistente:entrenar` (scripts/entrenar-asistente.ts). No editar a mano.

## Datos y modelo

- **Datos de entrenamiento:** 2206 preguntas generadas desde 104 plantillas,
  con sinónimos, rellenos ("oye", "por favor"), preguntas sin tildes (30 %) y errores de tipeo (15 %).
  Separadas al azar en 1764 de entrenamiento y 442 de prueba.
- **Representación:** la pregunta pasa por el extractor de entidades, que reemplaza tiendas, ciudades, clientes, marcas
  y métricas por marcadores (`_ciudad_`, `_metrica_`...). Luego TF-IDF sobre raíces de 5 letras y pares de raíces
  consecutivas: 835 características.
- **Modelo:** regresión logística multinomial, 600 épocas de Adam (tasa 0.05) con regularización L2 (0.00001).
  Las palabras desconocidas se corrigen a la del vocabulario más cercana (distancia de edición 1).
- **Umbral de confianza:** si la intención más probable no supera 45 %, el asistente responde que no está
  seguro y sugiere preguntas, en vez de adivinar. En esta evaluación eso cuenta como "fuera de alcance".

## Resultados

| Conjunto | Preguntas | Exactitud |
|---|---:|---:|
| Prueba (generadas, no vistas al entrenar) | 442 | 98.6% |
| Escritas a mano, solo clasificador | 75 | 93.3% |
| **Escritas a mano, motor completo** (clasificador + reglas) | 75 | **96.0%** |

Las preguntas generadas se parecen a las de entrenamiento, así que su exactitud es optimista. Las escritas a mano
miden cómo responde ante formas de preguntar que el modelo no vio; la última fila es lo que vive el usuario, porque el
motor suma reglas simples al clasificador: un saludo solo va a Ayuda, nombrar una tienda lleva a su detalle, y pedir
algo "por ciudad" o nombrar varios clientes lleva a la comparación entre grupos.

**Cómo se llegó a estas cifras.** La primera medición, con 250 épocas y L2 = 1e-4, dio 90,7 % con las preguntas a mano.
Después se agregaron categorías fuera de tema (clima, deportes, compras, cultura general), se reconocieron códigos con
espacio ("dm 101") y se compararon tres configuraciones de entrenamiento. Como esa comparación miró este mismo conjunto,
la cifra es algo optimista: para medir sin sesgo haría falta un tercer conjunto de preguntas nuevas.

### Por intención (preguntas escritas a mano)

| Intención | Preguntas | Precisión | Recall | F1 |
|---|---:|---:|---:|---:|
| Share de Honor (`resumen`) | 10 | 90.9% | 100.0% | 95.2% |
| Marca líder (`lider`) | 8 | 100.0% | 100.0% | 100.0% |
| Ranking de tiendas (`ranking_tiendas`) | 10 | 100.0% | 90.0% | 94.7% |
| Evolución en el tiempo (`tendencia`) | 8 | 87.5% | 87.5% | 87.5% |
| Cambios desde el corte anterior (`cambios_tiendas`) | 8 | 100.0% | 87.5% | 93.3% |
| Comparar ciudades o clientes (`por_grupo`) | 8 | 100.0% | 87.5% | 93.3% |
| Detalle de una tienda (`detalle_tienda`) | 7 | 100.0% | 100.0% | 100.0% |
| Tiendas sin medición (`sin_levantamiento`) | 5 | 100.0% | 100.0% | 100.0% |
| Ayuda (`ayuda`) | 5 | 100.0% | 80.0% | 88.9% |
| Fuera de alcance (`fuera`) | 6 | 66.7% | 100.0% | 80.0% |

### Matriz de confusión (preguntas escritas a mano)

| real \ predicha | `resumen` | `lider` | `ranking_tiendas` | `tendencia` | `cambios_tiendas` | `por_grupo` | `detalle_tienda` | `sin_levantamiento` | `ayuda` | `fuera` |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `resumen` | **10** | . | . | . | . | . | . | . | . | . |
| `lider` | . | **8** | . | . | . | . | . | . | . | . |
| `ranking_tiendas` | . | . | **9** | . | . | . | . | . | . | 1 |
| `tendencia` | . | . | . | **7** | . | . | . | . | . | 1 |
| `cambios_tiendas` | . | . | . | 1 | **7** | . | . | . | . | . |
| `por_grupo` | 1 | . | . | . | . | **7** | . | . | . | . |
| `detalle_tienda` | . | . | . | . | . | . | **7** | . | . | . |
| `sin_levantamiento` | . | . | . | . | . | . | . | **5** | . | . |
| `ayuda` | . | . | . | . | . | . | . | . | **4** | 1 |
| `fuera` | . | . | . | . | . | . | . | . | . | **6** |

### Errores del motor completo

- "en cuales tiendas samsung nos supera": esperaba ranking_tiendas, respondió fuera (regla: confianza baja)
- "vamos para arriba o para abajo?": esperaba tendencia, respondió fuera (regla: confianza baja)
- "que locales empeoraron esta vez": esperaba cambios_tiendas, respondió tendencia

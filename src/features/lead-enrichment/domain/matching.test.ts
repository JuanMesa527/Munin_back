/**
 * Tests del matching de F2.1.
 *
 * Lo que se protege aqui es la propiedad que le vamos a mostrar al jurado: la
 * baraja CAMBIA con el perfil y el porque se puede leer. Un matching que
 * devuelve el mismo orden para todos es indistinguible de no tener matching.
 */

import { describe, expect, it } from 'vitest';
import type { Factor, LeadProfile, ProjectCard } from '@contracts';
import { LEADS_DEMO } from '../../../shared/infrastructure/persistence/demo-seed.js';
import {
  cabeEnCapacidad,
  calcularFactores,
  explicarMatch,
  matchProjects,
  similitudDe,
} from './matching.js';

function ficha(sobrescribe: Partial<ProjectCard> = {}): ProjectCard {
  return {
    proyectoId: 'proyecto-prueba',
    nombre: 'Proyecto Prueba',
    ubicacion: 'Sector Prueba',
    ciudad: 'Soacha',
    zona: 'sur',
    esVIS: true,
    descripcion: 'Ficticio, solo para tests.',
    unidades: 100,
    torres: 2,
    pisos: '6 pisos',
    areaDesde: 48,
    areaHasta: null,
    habitacionesDesde: 3,
    habitacionesHasta: 3,
    tipologias: [
      {
        nombre: 'Tipo unico',
        areaConstruida: 48,
        areaPrivada: 43,
        habitaciones: 3,
        banos: 2,
        precioSMMLV: null,
      },
    ],
    amenidades: ['Parque infantil', 'Cancha multiple', 'Salon para ninos'],
    lugaresCercanos: ['Colegio'],
    entrega: null,
    certificacionEdge: false,
    salaDeVentas: null,
    brochureUrl: 'https://example.com/brochure.html',
    imagen: '/proyectos/proyecto-prueba.webp',
    precio: {
      desde: 190_000_000,
      hasta: 240_000_000,
      esEstimado: true,
      metodo: 'estimado para el test',
    },
    ...sobrescribe,
  };
}

const familia = LEADS_DEMO[0]!;
const joven = LEADS_DEMO[1]!;
const alto = LEADS_DEMO[2]!;

describe('calcularFactores', () => {
  it('expone SIEMPRE los cinco ejes, aunque el lead venga incompleto', () => {
    const vacio: LeadProfile = {
      ...familia,
      ciudad: null,
      personasACargo: null,
      rangoSalarial: null,
      capacidad: null,
    };

    const factores = calcularFactores(vacio, ficha());

    // Glass-box: si no se puede explicar, no se muestra. Nunca menos de 5.
    expect(factores).toHaveLength(5);
    expect(factores.every((f) => f.valor.length > 0)).toBe(true);
  });

  it('los pesos suman 1 para que la similitud viva en 0..1', () => {
    const factores = calcularFactores(familia, ficha());
    const suma = factores.reduce((total, f) => total + f.peso, 0);
    expect(suma).toBeCloseTo(1, 5);
  });

  it('castiga el proyecto que se sale del techo de capacidad', () => {
    const barato = calcularFactores(
      familia,
      ficha({ precio: { ...ficha().precio, desde: 150_000_000 } }),
    );
    const caro = calcularFactores(
      familia,
      ficha({ precio: { ...ficha().precio, desde: 400_000_000 } }),
    );

    const capacidadDe = (fs: ReturnType<typeof calcularFactores>): number =>
      fs.find((f) => f.nombre === 'Capacidad estimada')?.contribucion ?? 0;

    expect(capacidadDe(caro)).toBeLessThan(capacidadDe(barato));
  });

  it('premia la VIS para un hogar bajo el tope del SFV y la castiga arriba', () => {
    const tipoDe = (lead: LeadProfile, esVIS: boolean): number =>
      calcularFactores(lead, ficha({ esVIS })).find((f) => f.nombre === 'Tipo de vivienda')
        ?.contribucion ?? 0;

    // familia gana 2-4 SMMLV: la VIS es su via al subsidio.
    expect(tipoDe(familia, true)).toBeGreaterThan(tipoDe(familia, false));
    // alto gana 6-10 SMMLV: la VIS le queda por debajo.
    expect(tipoDe(alto, false)).toBeGreaterThan(tipoDe(alto, true));
  });

  it('gate de subsidio: si el lead YA tiene vivienda, la VIS pierde su argumento', () => {
    const tipoVivienda = (lead: LeadProfile): Factor =>
      calcularFactores(lead, ficha({ esVIS: true })).find((f) => f.nombre === 'Tipo de vivienda')!;

    // familia gana 2-4 SMMLV (bajo el tope del SFV): sin vivienda, la VIS aplica
    // al subsidio; con vivienda propia, el subsidio de PRIMERA vivienda se cae.
    const sinVivienda = tipoVivienda({ ...familia, tieneVivienda: false });
    const conVivienda = tipoVivienda({ ...familia, tieneVivienda: true });

    expect(conVivienda.contribucion).toBeLessThan(sinVivienda.contribucion);
    expect(conVivienda.valor).toMatch(/subsidio de primera no aplica/i);
  });

  it('castiga el apartaestudio para un hogar con tres dependientes', () => {
    const tamanoDe = (habitaciones: number): number =>
      calcularFactores(
        familia,
        ficha({ habitacionesDesde: habitaciones, habitacionesHasta: habitaciones }),
      ).find((f) => f.nombre === 'Tamano del hogar')?.contribucion ?? 0;

    expect(tamanoDe(1)).toBeLessThan(tamanoDe(3));
  });
});

describe('similitudDe', () => {
  it('queda entre 0 y 1', () => {
    for (const lead of [familia, joven, alto]) {
      const similitud = similitudDe(calcularFactores(lead, ficha()));
      expect(similitud).toBeGreaterThanOrEqual(0);
      expect(similitud).toBeLessThanOrEqual(1);
    }
  });
});

describe('explicarMatch', () => {
  it('cita los factores que empujaron el proyecto hacia arriba', () => {
    const buena = ficha();
    const razon = explicarMatch(familia, buena);

    expect(razon).toContain('Te lo mostramos porque');
    expect(razon).toContain('cabe en tu techo estimado');
  });

  it('NUNCA presenta una carencia como motivo para mostrar el proyecto', () => {
    // Fuera de presupuesto, fuera de ciudad y muy chico para el hogar.
    const mala = ficha({
      ciudad: 'Ubate',
      habitacionesDesde: 1,
      habitacionesHasta: 1,
      esVIS: false,
      amenidades: [],
      precio: { desde: 900_000_000, hasta: null, esEstimado: true, metodo: 'test' },
    });

    const razon = explicarMatch(familia, mala);

    expect(razon).not.toContain('Te lo mostramos porque');
    expect(razon).not.toContain('por encima de tu techo estimado');
    expect(razon).toContain('se aleja de lo que buscas');
  });
});

describe('cabeEnCapacidad', () => {
  it('es null -- no false -- cuando el lead todavia no tiene capacidad estimada', () => {
    // "No sabemos cuanto puedes pagar" no es "no te alcanza". Colapsar los dos
    // en `false` le hace decir a la UI algo que no podemos sostener.
    expect(cabeEnCapacidad(null, ficha())).toBeNull();
  });

  it('compara contra el piso de la banda, no contra el techo', () => {
    const capacidad = { ...familia.capacidad!, precioMaximoEstimado: 200_000_000 };
    // desde 190M cabe; el `hasta` de 240M no debe hacerlo fallar.
    expect(cabeEnCapacidad(capacidad, ficha())).toBe(true);
  });
});

describe('confianza del match', () => {
  const sinNada: LeadProfile = {
    ...familia,
    ciudad: null,
    personasACargo: null,
    rangoSalarial: null,
    capacidad: null,
  };

  it('un lead sin datos saca ~50% de afinidad, y por eso declara confianza 0', () => {
    // Este es EL caso que motivo el campo: el puntaje tiene piso porque los
    // ejes sin dato puntuan neutro. Si el 50% viajara solo, se leeria como
    // "medio compatible" cuando significa "no sabemos nada de ti".
    const [tarjeta] = matchProjects(sinNada, [ficha()]);

    expect(tarjeta!.match.similitud).toBeCloseTo(0.5, 2);
    expect(tarjeta!.match.confianza).toBe(0);
    expect(tarjeta!.match.datosFaltantes).toHaveLength(5);
  });

  it('un lead completo declara confianza 1 y no reporta faltantes', () => {
    const [tarjeta] = matchProjects(familia, [ficha()]);

    expect(tarjeta!.match.confianza).toBe(1);
    expect(tarjeta!.match.datosFaltantes).toEqual([]);
  });

  it('pondera por PESO del eje, no por cantidad de ejes', () => {
    // Falta un solo eje en los dos casos, pero capacidad vale 0.40 y estilo de
    // vida 0.08: la confianza tiene que distinguirlos.
    const sinCapacidad = matchProjects({ ...familia, capacidad: null }, [ficha()])[0]!;
    const sinHogar = matchProjects({ ...familia, personasACargo: null }, [ficha()])[0]!;

    expect(sinCapacidad.match.confianza).toBe(0.6);
    // `personasACargo` alimenta tamano del hogar (0.15) y estilo de vida (0.08).
    expect(sinHogar.match.confianza).toBe(0.77);
    expect(sinCapacidad.match.confianza).toBeLessThan(sinHogar.match.confianza);
  });

  it('declara que no sabe si el lead ya tiene vivienda, aunque siga suponiendo que no', () => {
    // El gate del subsidio de primera vivienda solo dispara con
    // `tieneVivienda === true`, asi que `null` puntua 1: se SUPONE primera
    // vivienda. La suposicion es razonable y se queda -- pero se declara.
    const [tarjeta] = matchProjects({ ...familia, tieneVivienda: null }, [ficha({ esVIS: true })]);

    expect(tarjeta!.match.datosFaltantes).toContain('si ya tienes vivienda propia');
    expect(tarjeta!.match.confianza).toBeLessThan(1);
  });

  it('no supone un perfil joven cuando no sabe cuantas personas hay a cargo', () => {
    // Antes el `?? 0` trataba al lead desconocido como joven sin hijos y le
    // puntuaba gimnasio y coworking: una suposicion vendida como medicion.
    const estilo = calcularFactores({ ...familia, personasACargo: null }, ficha()).find(
      (f) => f.nombre === 'Estilo de vida',
    );

    expect(estilo?.intensidad).toBe(50);
    expect(estilo?.valor).toContain('no sabemos');
  });

  it('marca cabeEnCapacidad en false para un proyecto que puntua alto pero no alcanza', () => {
    // La capacidad se hunde gradual, asi que un proyecto apenas por encima del
    // techo conserva un puntaje alto. El numero solo no puede delatarlo.
    const capacidad = { ...familia.capacidad!, precioMaximoEstimado: 185_000_000 };
    const [tarjeta] = matchProjects({ ...familia, capacidad }, [ficha()]);

    expect(tarjeta!.match.similitud).toBeGreaterThan(0.7);
    expect(tarjeta!.match.cabeEnCapacidad).toBe(false);
  });
});

describe('matchProjects', () => {
  const catalogo: ProjectCard[] = [
    ficha({
      proyectoId: 'vis-familiar-soacha',
      ciudad: 'Soacha',
      esVIS: true,
      habitacionesDesde: 3,
      habitacionesHasta: 3,
    }),
    ficha({
      proyectoId: 'estudio-bogota',
      ciudad: 'Bogota',
      zona: 'centro',
      esVIS: true,
      habitacionesDesde: 1,
      habitacionesHasta: 1,
      amenidades: ['Coworking', 'Gimnasio', 'Social living y coworking'],
      precio: { desde: 175_000_000, hasta: 200_000_000, esEstimado: true, metodo: 'test' },
    }),
    ficha({
      proyectoId: 'no-vis-grande',
      ciudad: 'Bogota',
      zona: 'norte',
      esVIS: false,
      habitacionesDesde: 3,
      habitacionesHasta: 3,
      precio: { desde: 320_000_000, hasta: null, esEstimado: true, metodo: 'test' },
    }),
  ];

  it('ordena distinto segun el perfil: eso es el matching', () => {
    const paraFamilia = matchProjects(familia, catalogo)[0]?.ficha.proyectoId;
    const paraJoven = matchProjects(joven, catalogo)[0]?.ficha.proyectoId;
    const paraAlto = matchProjects(alto, catalogo)[0]?.ficha.proyectoId;

    expect(paraFamilia).toBe('vis-familiar-soacha');
    expect(paraJoven).toBe('estudio-bogota');
    expect(paraAlto).toBe('no-vis-grande');
  });

  it('devuelve el catalogo completo: ver lo que NO calza tambien informa', () => {
    expect(matchProjects(familia, catalogo)).toHaveLength(catalogo.length);
  });

  it('respeta el limite', () => {
    expect(matchProjects(familia, catalogo, 2)).toHaveLength(2);
  });

  it('es determinista: dos corridas del mismo lead dan el mismo orden', () => {
    const ids = (): string[] =>
      matchProjects(familia, catalogo).map((tarjeta) => tarjeta.ficha.proyectoId);
    expect(ids()).toEqual(ids());
  });

  it('cada tarjeta trae sus factores, sin excepcion (regla 21)', () => {
    for (const tarjeta of matchProjects(joven, catalogo)) {
      expect(tarjeta.factores.length).toBeGreaterThan(0);
      expect(tarjeta.match.razon.length).toBeGreaterThan(0);
    }
  });

  it('resuelve en el match los datos renderizables exigidos por A8', () => {
    const card = matchProjects(familia, catalogo)[0]!;

    expect(card.match).toMatchObject({
      proyectoId: card.ficha.proyectoId,
      nombre: card.ficha.nombre,
      etapa: expect.any(String),
      precioDesde: card.ficha.precio.desde,
      tipologia: expect.any(String),
    });
    expect(
      card.factores.every((factor) => factor.intensidad >= 0 && factor.intensidad <= 100),
    ).toBe(true);
  });

  it('no confunde la entrega con la etapa comercial y usa separador ASCII', () => {
    const card = matchProjects(familia, [
      ficha({
        entrega: 'Segundo semestre de 2027',
        tipologias: [
          { ...ficha().tipologias[0]!, nombre: 'Tipo A' },
          { ...ficha().tipologias[0]!, nombre: 'Tipo B' },
        ],
      }),
    ])[0]!;

    expect(card.match.etapa).toBe('Por confirmar');
    expect(card.match.tipologia).toBe('Tipo A / Tipo B');
  });
});

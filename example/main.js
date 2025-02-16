/** @typedef {import('../unrawheel.js').UnraWheelData} UnraWheelData */
/** @typedef {import('../unrawheel.js').UnraWheel} UnraWheel */

/** @type {UnraWheelData} */
const data = [
   {
      // key: 'a',              // keyboard key bound to section, uses defaults if undefined
      value: 'value_1',         // value sent to section-select callback when section is selected
      image: './icons/apc.png', // optional url/path to image shown in section
      text: 'IFVs & APCs',      // text shown in section (also acts as aria-label for section)
   },
   {
      value: 'value_2',
      image: './icons/turret.png',
      text: 'Anti-tank Missile',
   },
   {
      value: 'value_3',
      image: './icons/jeep.png',
      text: 'Tactical & MRAP',
   },
   {
      value: 'value_4',
      image: './icons/flatbed-covered.png',
      text: 'Support & Logistics',
   },
   {
      value: 'value_5',
      image: './icons/tank.png',
      text: 'Tanks & -Support',
   },
];

/** @type {UnraWheel} */
const unrawheel = document.querySelector('unrawheel-v1');

// * Note: you can edit some style properties here, but I suggest just editing the code outright
// * to make it look exactly as you want. yoink and twist!
// unrawheel.style.section.stroke.color = '#CCA';
// unrawheel.style.center.fillColor = '#CAA';
// unrawheel.style.center.stroke.color = '#CCA';

unrawheel.setSections(data);
// * Note: you can also use the data attribute to set the section data:
// unrawheel.setAttribute('data', JSON.stringify(data));

let counter = 0;

// * Note: this event fires when the user selects a section
unrawheel.addEventListener('section-select', (e) => {
   // * Note: this is the selected value
   console.log(e.detail.value);

   // I was too lazy to make actual test data, hence the mess here
   counter += e.detail.value === -1 ? -1 : 1;
   if (counter === -1) counter = 0;

   /** @type {UnraWheelData} */
   let ndata = [];
   for (let i = 0; i < 5; i++) {
      if (i === 0 && counter % 3 === 0) continue;
      if (i === 1 && counter % 5 === 0) continue;
      ndata.push(Object.assign({}, data[i], { text: data[(i + counter) % 5].text, image: data[(i + counter) % 5].image }));
   }

   unrawheel.setSections(ndata);

   // * Note: you can manually control the lock/unlock with toggleLockWheel()
   // * this works best if you don't set the auto-lock attribute on the element
   // unrawheel.toggleLockWheel(false);
});

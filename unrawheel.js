/*
 * UnraWheel.js - A custom, lightweight wheel select element
 * Copyright (C) 2025 Nooa Lumilaakso
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * @typedef {Object} UnraWheelSection
 * @property {string} [key] - keyboard key bound to section, uses defaults if undefined
 * @property {*} value - value sent to section-select callback when section is selected
 * @property {string} text - text shown in section (also acts as aria-label for section)
 * @property {string} [image] - optional url/path to image shown in section
 */

/** @typedef {Array<UnraWheelSection>} UnraWheelData */

/**
 * Custom web component representing a wheel select
 *
 * @element unrawheel-v1
 *
 * @attribute {number} [section-count] - number of sections (one section will be added for back button)
 *    required if dynamic-section-count isn't set
 * @attribute {boolean} [dynamic-section-count] - set to make section count non-static
 * @attribute {string} [data] - JSON string of section data
 * @attribute {boolean} [auto-lock] - set to automatically lock wheel when user makes a selection
 *    and unlock it when new sections are set
 */
export class UnraWheel extends HTMLElement {
   style = {
      sectionPointer: {
         stroke: {
            color: '#BBB',
            width: 0.02,
         },
      },
      section: {
         stroke: {
            color: '#888',
            width: 0.01,
         },
      },
      keyText: {
         color: '#FFF',
         size: 0.07,
         font: '"Nimbus Mono PS", "Courier New", monospace',
      },
      contentText: {
         color: '#FFF',
         size: '0.06',
         font: '"Open Sans", sans-serif',
      },
      image: {
         width: 0.2,
         height: 0.2,
      },
      background: {
         color: '#333333F3',
      },
      center: {
         stroke: {
            color: '#888',
            width: 0.01,
         },
         fillColor: '#000',
      },
      backArrow: {
         fillColor: '#888',
      },
   };

   /** @type {UnraWheelData|null} */
   #data = null;

   // internal state
   #angleStep = 0;
   #angleOffset = 0;
   #prevHoverIndex = 0;
   #currSectionPointerRotation = 0;
   #keyDistanceFromCenter = 0;
   #sectionCount = 0;
   #imageDistanceFromCenter = 0.65;
   #radiusScale = 0.99;
   #isMouseOver = false;
   #isLocked = true;
   #autoLockWheel = false;
   #staticSectionCount = false;

   /**
    * @typedef {Object} UnraWheelElements
    * @property {SVGPathElement[]} sections
    * @property {SVGAElement[]} links
    * @property {SVGImageElement[]} images
    * @property {SVGTextElement[]} keyTexts
    * @property {SVGTextElement[]} contentTexts
    */

   /** @type {UnraWheelElements} */
   #elements = {
      sections: [],
      links: [],
      images: [],
      keyTexts: [],
      contentTexts: [],
   };

   // prettier-ignore
   #defaultKeys = [
      'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l',
      'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
      'z', 'x', 'c', 'v', 'b', 'n', 'm',
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'
  ];

   #CSS = `
        svg {
            width: 100%;
            height: 100%;
        }

        .unrawheel--locked {
            pointer-events: none;
            user-select: none;
        }

        .unrawheel--locked .section {
            transition: fill 0.4s;
            fill: #666;
        }

        .section {
            cursor: pointer;
            transition: fill 0.2s;
            fill: transparent;
        }

        .section--back {
        }

        .section--empty {
            fill: #666;
         }

        .section.section--selected {
            animation: 0.1s ease flash;
        }

        @keyframes flash {
            0% {
                fill: #111;
            }
            100% {
                fill: transparent;
            }
        }

        .section-pointer {
            transform-origin: 0 0;
            transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), opacity .2s ease;
            opacity: 0;
        }

        .section-pointer--show {
            opacity: 1;
        }

        .section-link:focus {
            outline: none;
        }

        [role="listitem"]:has(> .section-link:focus) .section {
            fill: #222;
        }
    `;

   static get observedAttributes() {
      return ['data'];
   }

   constructor() {
      super();
      this.attachShadow({ mode: 'open' });

      // manage section count
      const dynamicSectionCount = this.hasAttribute('dynamic-section-count');
      if (!dynamicSectionCount) {
         const sectionCountOption = this.getAttribute('section-count');
         if (sectionCountOption === null) throw new TypeError('[UnraWheel] Invalid properties: section-count must be defined (or use dynamic-section-count)');
         if (!Number(sectionCountOption) > 0) throw new TypeError('[UnraWheel] Invalid properties: section-count must be a number greater than zero');

         this.#staticSectionCount = true;
         this.#sectionCount = Number(sectionCountOption) + 1;
      }

      this.#autoLockWheel = this.hasAttribute('auto-lock');

      // set initial data and unlock wheel if provided
      if (this.hasAttribute('data')) {
         this.#setData(this.getAttribute('data'));
         this.#isLocked = false;
      }
      this.#initialRender();

      // render data if initial data provided
      this.#data !== null && this.#render();

      // add keyboard event listener
      document.addEventListener('keydown', this.#onKeyPress);
   }

   /**
    * Set section data
    * @param {string|UnraWheelData} data - sections as JSON string or array
    * @returns {void}
    */
   #setData(data) {
      const self = this;

      if (typeof data === 'string') {
         try {
            data = JSON.parse(data);
         } catch (e) {
            throw new TypeError('[UnraWheel] Invalid data: failed to parse JSON string');
         }
      }
      if (!Array.isArray(data)) throw new TypeError('[UnraWheel] Invalid data: expected an array');
      if (data.length === 0) throw new TypeError('[UnraWheel] Invalid data: array cannot be empty');
      if (this.#staticSectionCount && data.length > this.#sectionCount - 1) throw new TypeError('[UnraWheel] Invalid data: too many options for given section count');

      this.#data = data.map(function parseUnraWheelData(item, i) {
         item = Object.assign({}, item);

         if (typeof item !== 'object' || item === null) {
            throw new TypeError(`[UnraWheel] Invalid data: item at index ${i} must be an object`);
         }

         if (!Object.hasOwn(item, 'value')) throw new TypeError(`[UnraWheel] Invalid data: item at index ${i} must have a 'value' property`);

         if (!Object.hasOwn(item, 'text')) throw new TypeError(`[UnraWheel] Invalid data: item at index ${i} must have a 'text' property`);
         if (typeof item.text !== 'string') throw new TypeError(`[UnraWheel] Invalid data: 'text' in item at index ${i} must be a string`);

         if (Object.hasOwn(item, 'image') && typeof item.image !== 'string') {
            throw new TypeError(`[UnraWheel] Invalid data: 'image' in item at index ${i} must be a string (path or URL)`);
         }

         if (!Object.hasOwn(item, 'key')) item.key = self.#defaultKeys[i];
         else if (typeof item.key !== 'string' || item.key.length !== 1) throw new TypeError(`[UnraWheel] Invalid data: 'key' in item at index ${i} must be a string of length 1`);

         return item;
      });

      // update section count if using dynamic sections
      const prevSegCount = this.#sectionCount;
      if (!this.#staticSectionCount) {
         this.#sectionCount = this.#data ? this.#data.length + 1 : 0;
      }

      // re/set internal state
      if (prevSegCount !== this.#sectionCount) {
         this.#prevHoverIndex = 0;
         this.#currSectionPointerRotation = 0;
      }

      // pre-calculate values used for rendering
      this.#angleStep = (2 * Math.PI) / this.#sectionCount;
      this.#angleOffset = Math.PI + this.#angleStep / 2;
      this.#keyDistanceFromCenter = 0.25 + Math.abs(0.1 * ((this.#sectionCount - 6) / 20)); // 0 - 1
   }

   /**
    * Set section data and render
    * @param {string|UnraWheelData} data - sections as JSON string or array
    * @returns {void}
    */
   setSections(data) {
      const prevSegCount = this.#data === null ? 0 : this.#sectionCount;
      this.#setData(data);
      this.#render(prevSegCount !== this.#sectionCount);
      if (this.#autoLockWheel) this.toggleLockWheel(false);
   }

   /**
    * Toggle lock/unlock wheel for user input
    * @param {boolean} toggleLock
    */
   toggleLockWheel(toggleLock) {
      if (toggleLock === this.#isLocked) return;
      this.#isLocked = toggleLock;

      // enable/disable pointer events
      this.svg.classList[this.#isLocked ? 'add' : 'remove']('unrawheel--locked');

      // make links selectable/unselectable
      this.#elements.links.forEach((el) => {
         el.setAttribute('tabindex', this.#isLocked ? '-1' : '0');
      });
   }

   /**
    * Key press callback - handle section selection via key press
    * @param {KeyboardEvent} e
    * @returns {void}
    */
   #onKeyPress = (e) => {
      if (this.#isLocked) return;

      if (e.key === 'Backspace') {
         this.#onSectionSelect(this.#elements.sections.length - 1);
         return;
      }

      const index = this.#data.findIndex((item) => item.key === e.key);
      if (index !== -1) this.#onSectionSelect(index);
   };

   /**
    * Mouse click callback - handle section selection via mouse click
    * @param {MouseEvent} e
    * @returns {void}
    */
   #onSectionClick = (e) => {
      const index = Number(e.target.dataset.section);
      this.#onSectionSelect(index);
   };

   /**
    * Mouse hover callback - handle moving section pointer
    * @param {MouseEvent} e
    * @returns {void}
    */
   #onSectionHover = (e) => {
      const index = Number(e.target.getAttribute('data-section'));
      if (index === this.#prevHoverIndex) return;

      if (index > this.#data.length - 1 && index !== this.#sectionCount - 1) return;

      // TODO figure out how this is done by sane people
      const distThroughZero = this.#sectionCount - this.#prevHoverIndex + index;
      const distThroughZeroReverse = -(this.#sectionCount + this.#prevHoverIndex - index);
      const distDirect = index - this.#prevHoverIndex;

      const distance = [distThroughZero, distThroughZeroReverse, distDirect].reduce((dist, prev, index) => {
         return index === 0 ? dist : Math.abs(dist) < Math.abs(prev) ? dist : prev;
      });

      const newRotation = this.#currSectionPointerRotation + (360 / this.#sectionCount) * distance;
      this.sectionPointerElem.style.transform = `rotate(${newRotation.toString()}deg)`;

      this.#currSectionPointerRotation = newRotation;
      this.#prevHoverIndex = index;
   };

   /**
    * Mouse enter callback - show section pointer
    * @param {MouseEvent} e
    * @returns {void}
    */
   #onMouseEnter = (e) => {
      this.#isMouseOver = true;
      this.sectionPointerElem && this.sectionPointerElem.classList.add('section-pointer--show');
   };

   /**
    * Mouse leave callback - hide section pointer
    * @param {MouseEvent} e
    * @returns {void}
    */
   #onMouseLeave = (e) => {
      this.#isMouseOver = false;
      this.sectionPointerElem && this.sectionPointerElem.classList.remove('section-pointer--show');
   };

   /**
    * Handle section select
    * @param {number} sectionIndex - index of section to select
    * @returns {void}
    */
   #onSectionSelect = (sectionIndex) => {
      // last section is the back button
      const isBackSection = sectionIndex === this.#elements.sections.length - 1;

      if (!isBackSection && (this.#data[sectionIndex] === undefined || this.#data[sectionIndex]?.key === '')) return;

      const elem = this.#elements.sections[sectionIndex];

      if (!elem.classList.contains('section--selected')) {
         elem.classList.add('section--selected');
         setTimeout(() => {
            elem && elem.classList.remove('section--selected');
         }, 100);
      }

      if (this.#autoLockWheel) this.toggleLockWheel(true);

      this.dispatchEvent(
         new CustomEvent('section-select', {
            detail: {
               value: sectionIndex === -1 || sectionIndex === this.#sectionCount - 1 ? -1 : this.#data[sectionIndex].value,
            },
         })
      );
   };

   /**
    * Get default key by section index
    * @param {number} index - section index
    * @returns {string} default key
    */
   indexToDefaultKey(index) {
      return this.#defaultKeys[index % this.defaultKeys.length];
   }

   /**
    * Create text element
    * @param {'key'|'content'} type
    * @param {number} x - x-pos of text center
    * @param {number} y - y-pos of text center
    * @returns {SVGTextElement}
    */
   #createTextElement(type, x, y) {
      const { size, font, color } = this.style[type === 'key' ? 'keyText' : 'contentText'];

      const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.setAttribute('x', x);
      el.setAttribute('y', y);
      el.setAttribute('font-size', size);
      el.setAttribute('font-family', font);
      el.setAttribute('fill', color);
      el.setAttribute('text-anchor', 'middle');
      el.setAttribute('dominant-baseline', 'middle');
      el.setAttribute('pointer-events', 'none');

      // text for options is set in links for screenreaders
      el.setAttribute('aria-hidden', 'true');

      // shift letters downwards to compensate for weird font baseline stuff that causes letters on lower
      // sections to appear closer to the center than letters on upper sections
      el.setAttribute('dy', '-.06em');
      el.setAttribute('dx', '-.07em');

      return el;
   }

   /**
    * Create section element
    * @param {number} index - section index (0..n)
    * @param {number} x1 - x-pos of 1st corner of sector
    * @param {number} y1 - y-pos of 1st corner
    * @param {number} x2 - x-pos of 2nd corner
    * @param {number} y2 - y-pos of 2nd corner
    * @returns {SVGPathElement } section
    */
   #createSectionElement(index, x1, y1, x2, y2) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', `M 0 0 L ${x1} ${y1} A 1 1 0 0 1 ${x2} ${y2} Z`);
      el.setAttribute('stroke', this.style.section.stroke.color);
      el.setAttribute('stroke-width', this.style.section.stroke.width);
      el.setAttribute('class', 'section');
      el.setAttribute('data-section', index);
      el.setAttribute('aria-hidden', 'true');

      return el;
   }

   /**
    * Create link element
    * @param {number} index - section index (0..n)
    * @returns {SVGAElement}
    */
   #createLinkElement(index) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'a');
      el.setAttribute('tabindex', this.#isLocked ? '-1' : '0');
      el.setAttribute('class', 'section-link');
      el.setAttribute('href', 'javascript:void(0);');
      el.setAttribute('data-section', index);

      return el;
   }

   /**
    * Create image element
    * @param {number} x - x-pos of image center
    * @param {number} y - y-pos of image center
    * @returns {SVGImageElement}
    */
   #createImageElement(x, y) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      el.setAttribute('x', x - this.style.image.width / 2);
      el.setAttribute('y', y - this.style.image.height / 2);
      el.setAttribute('pointer-events', 'none');
      el.setAttribute('width', this.style.image.width);
      el.setAttribute('height', this.style.image.height);
      el.setAttribute('href', '');
      el.setAttribute('aria-hidden', 'true');

      return el;
   }

   /**
    * Create section-pointer element
    * @param {number} x1 - x-pos of 1st corner of sector
    * @param {number} y1 - y-pos of 1st corner
    * @param {number} x2 - x-pos of 2nd corner
    * @param {number} y2 - y-pos of 2nd corner
    * @returns {SVGPathElement} section-pointer
    */
   #createSectionPointerElement(x1, y1, x2, y2) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', `M 0 0 L ${x1} ${y1} A 1 1 0 0 1 ${x2} ${y2} Z`);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', this.style.sectionPointer.stroke.color);
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('stroke-width', this.style.sectionPointer.stroke.width);
      el.setAttribute('pointer-events', 'none');
      el.setAttribute('class', 'section-pointer');
      el.setAttribute('id', 'section-pointer');
      el.setAttribute('aria-hidden', 'true');

      return el;
   }

   /**
    * Create wheel background element
    * @returns {SVGCircleElement}
    */
   #createBackgroundElement() {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('cx', '0');
      el.setAttribute('cy', '0');
      el.setAttribute('r', this.#radiusScale);
      el.setAttribute('fill', this.style.background.color);

      return el;
   }

   /**
    * Create center circle element
    * @returns {SVGCircleElement}
    */
   #createCenterCircleElement() {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('cx', '0');
      el.setAttribute('cy', '0');
      el.setAttribute('r', '0.18');
      el.setAttribute('fill', this.style.center.fillColor);
      el.setAttribute('stroke', this.style.center.stroke.color);
      el.setAttribute('stroke-width', this.style.center.stroke.width);

      return el;
   }

   /**
    * Render component skeleton (run once)
    * @returns {void}
    */
   #initialRender() {
      // add stylesheet
      const style = document.createElement('style');
      style.textContent = this.#CSS;
      this.shadowRoot.appendChild(style);

      // root svg element
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('viewBox', '-1 -1 2 2');
      this.svg.setAttribute('role', 'group');
      this.svg.setAttribute('aria-live', 'polite');

      // container for root svg element
      const container = document.createElement('div');
      container.appendChild(this.svg);
      this.shadowRoot.appendChild(container);

      // root svg mouse events
      this.svg.addEventListener('mouseenter', this.#onMouseEnter);
      this.svg.addEventListener('mouseleave', this.#onMouseLeave);
   }

   /**
    * Render component
    * @param {boolean} [sectionCountChanged=true] - true if sections should be redrawn (count changed)
    */
   #render(sectionCountChanged = true) {
      if (sectionCountChanged) {
         // remove existing content from memory
         this.#elements.sections.length = this.#elements.links.length = this.#elements.images.length = this.#elements.keyTexts.length = this.#elements.contentTexts.length = 0;

         // batch dom changes in fragment
         const root = document.createDocumentFragment();

         // draw background circle
         root.appendChild(this.#createBackgroundElement());

         // create group for sections
         const sectionList = document.createElementNS('http://www.w3.org/2000/svg', 'g');
         sectionList.setAttribute('role', 'list');
         sectionList.setAttribute('id', 'wheel-sections');
         sectionList.setAttribute('aria-label', 'wheel of selectable options');
         root.appendChild(sectionList);

         // generate sections
         for (let i = 0; i < this.#sectionCount; i++) {
            // create group for section
            const sectionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            sectionGroup.setAttribute('role', 'listitem');
            sectionList.appendChild(sectionGroup);

            // create link (for tab navigation and screen readers)
            const link = this.#createLinkElement(i);
            link.addEventListener('click', this.#onSectionClick);
            sectionGroup.appendChild(link);
            this.#elements.links.push(link);

            // calculate angles and coordinates
            const startAngle = i * this.#angleStep + this.#angleOffset;
            const endAngle = (i + 1) * this.#angleStep + this.#angleOffset;

            const x1 = Math.cos(startAngle) * this.#radiusScale;
            const y1 = Math.sin(startAngle) * this.#radiusScale;
            const x2 = Math.cos(endAngle) * this.#radiusScale;
            const y2 = Math.sin(endAngle) * this.#radiusScale;

            // draw the section
            const section = this.#createSectionElement(i, x1, y1, x2, y2);
            section.addEventListener('click', this.#onSectionClick);
            section.addEventListener('mouseenter', this.#onSectionHover);
            // last section is the back button
            if (i === this.#sectionCount - 1) section.classList.add('section--back');
            sectionGroup.appendChild(section);
            this.#elements.sections.push(section);

            // create pointer once
            if (i === 0) {
               this.sectionPointerElem = this.#createSectionPointerElement(x1, y1, x2, y2);
               if (this.#isMouseOver) this.sectionPointerElem.classList.add('section-pointer--show');
            }

            // calculate angles and coordinates for image / key text / content text
            const midAngle = startAngle + this.#angleStep / 2;
            const midX = Math.cos(midAngle);
            const midY = Math.sin(midAngle);

            const keyTextX = midX * this.#keyDistanceFromCenter;
            const keyTextY = midY * this.#keyDistanceFromCenter;
            const imageX = midX * this.#imageDistanceFromCenter;
            const imageY = midY * this.#imageDistanceFromCenter;
            const textX = imageX;
            const textY = imageY - this.style.image.height / 1.2;

            // draw key text
            const keyText = this.#createTextElement('key', keyTextX, keyTextY);
            this.#elements.keyTexts.push(keyText);

            // draw content text
            const conText = this.#createTextElement('content', textX, textY);
            this.#elements.contentTexts.push(conText);

            // draw image
            const imageContent = this.#createImageElement(imageX, imageY);
            this.#elements.images.push(imageContent);

            // last section is back button; draw arrow icon
            if (i === this.#sectionCount - 1) {
               const tMidX = midX * 0.83;
               const tMidY = midY * 0.83;
               const scale = 0.08;

               const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
               arrow.setAttribute('points', `${tMidX - scale},${tMidY} ${tMidX},${tMidY + scale} ${tMidX},${tMidY - scale}`);
               arrow.setAttribute('fill', this.style.backArrow.fillColor);
               sectionGroup.appendChild(arrow);
            }
         }

         // append these here so they always render on top
         for (let i = 0; i < this.#sectionCount; i++) {
            root.appendChild(this.#elements.keyTexts[i]);
            root.appendChild(this.#elements.images[i]);
            root.appendChild(this.#elements.contentTexts[i]);
         }

         // draw section pointer and center circle
         root.appendChild(this.sectionPointerElem);
         root.appendChild(this.#createCenterCircleElement());

         // replace existing content
         this.svg.replaceChildren(root);
      }

      // set contents
      for (let i = 0; i < this.#sectionCount; i++) {
         // last section is the back button
         const isBackSection = i === this.#sectionCount - 1;

         // with static section count, there may be less items in data than there are sections.
         // for these, we draw blanks
         const isBlankSection = !isBackSection && i > this.#data.length - 1;

         const contentText = this.#elements.contentTexts[i];
         const keyText = this.#elements.keyTexts[i];
         const image = this.#elements.images[i];
         const link = this.#elements.links[i];
         const section = this.#elements.sections[i];

         if (isBlankSection) {
            contentText.textContent = '';
            contentText.setAttribute('display', 'none');

            keyText.textContent = '';
            keyText.setAttribute('display', 'none');

            image.setAttribute('href', '');
            image.setAttribute('display', 'none');

            link.setAttribute('aria-label', '');
            link.setAttribute('display', 'none');

            section.classList.add('section--empty');

            // ! early exit for blank sections
            continue;
         }

         section.classList.remove('section--empty');

         contentText.textContent = isBackSection ? '' : this.#data[i].text;
         contentText.setAttribute('display', 'initial');

         keyText.textContent = isBackSection ? '' : this.#data[i].key !== undefined ? this.#data[i].key : this.indexToDefaultKey(i);
         keyText.setAttribute('display', 'initial');

         if (!isBackSection && this.#data[i].image) {
            image.setAttribute('href', this.#data[i].image);
            image.setAttribute('display', 'initial');
         } else {
            image.setAttribute('href', '');
            image.setAttribute('display', 'none');
         }

         link.setAttribute('display', 'initial');

         link.setAttribute('aria-label', isBackSection ? 'go back' : this.#data[i].text);
         image.setAttribute('display', 'initial');
      }
   }

   attributeChangedCallback(name, _, newValue) {
      if (name === 'data') this.setSections(newValue);
   }

   disconnectedCallback() {
      document.removeEventListener('keydown', this.#onKeyPress);
   }
}

customElements.define('unrawheel-v1', UnraWheel);

/**
 * bhs-calculator data + pricing, ported 1:1 from the source page
 * (asianpaints.com clientlib-bhs-calculator: bizBHInteriorCalculator,
 * renderBHInteriorCalculator's room order, pricingbifurcation, roomwisedata,
 * onClickBHInteriorCalculator). The result page reads the same
 * sessionStorage "bhCalculatorData" object, so its shape, key order and
 * value types are kept exactly (including the source's quirks, noted inline).
 */

/** the content-fragment request the source posts to the data endpoint */
export function dataRequest(searchPath) {
  return JSON.stringify({
    data: {
      searchpath: searchPath,
      contentfrags: [
        { packageDetailRoomWiseList: '/conf/apcolourcatalogue/settings/dam/cfm/models/package-detail-room-wise' },
        { packagePriceBhsList: '/conf/apcolourcatalogue/settings/dam/cfm/models/package-price-bhs' },
        { bHSCalRefernceList: '/conf/apcolourcatalogue/settings/dam/cfm/models/bhs_cal_reference' },
      ],
    },
    headerJson: {},
  });
}

const parseList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (e) { return null; }
  }
  return null;
};

/** bizBHInteriorCalculator: the endpoint response -> dataMapping (mutated in place) */
export function mapData(resp, dataMapping = {}) {
  const dm = dataMapping;
  (resp?.data?.packageDetailRoomWiseList?.items || []).forEach((each) => {
    const packagetype = each.packagetype.toLowerCase();
    const roomType = each.roomType.toLowerCase();
    dm[roomType] = dm[roomType] || {};
    dm[roomType][packagetype] = dm[roomType][packagetype] || {};
    dm[roomType][packagetype].packagedesc = each.compdesc;
    dm[roomType][packagetype].image = each.image;
    dm[roomType][packagetype].features = dm[roomType][packagetype].features || [];
    if (Object.prototype.hasOwnProperty.call(each, 'packagemaster')) {
      const list = parseList(each.packagemaster);
      (list || []).forEach((item) => {
        const data = typeof item === 'string' ? parseList(item) : item;
        if (!data) return;
        dm[roomType][packagetype].features.push({ name: data.featurename, description: data.desc });
      });
    }
  });

  const sorted = (resp?.data?.packagePriceBhsList?.items || [])
    .sort((a, b) => parseInt(a.numbering, 10) - parseInt(b.numbering, 10));
  sorted.forEach((each) => {
    const roomType = each.roomType.toLowerCase();
    dm[roomType] = dm[roomType] || {};
    dm[roomType].text = each.roomType;
    dm[roomType].numbering = parseFloat(each.numbering);
    if (Object.prototype.hasOwnProperty.call(each, 'check')) dm[roomType].check = each.check.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(each, 'packagemaster')) {
      (parseList(each.packagemaster) || []).forEach((item) => {
        if (!item || typeof item !== 'object' || !item.package_name || !item.price) return;
        const packagetype = item.package_name.toLowerCase();
        const price = Number(item.price);
        if (Number.isNaN(price)) return;
        dm[roomType][packagetype] = dm[roomType][packagetype] || {};
        dm[roomType][packagetype].price = price;
        dm[roomType][packagetype].priceStr = item.price;
        dm[roomType][packagetype].text = item.package_name;
      });
    }
  });

  // room-wise price bifurcation (rooms with check "true")
  (resp?.data?.bHSCalRefernceList?.items || []).forEach((cf) => {
    (cf.enterThePathForTheRoomWisePriceBifurcation || []).forEach((each) => {
      const packagetype = each.packagetype.toLowerCase();
      const roomType = each.mainRoomType.toLowerCase();
      const subroom = each.roomType.toLowerCase();
      dm.pricebifurcation = dm.pricebifurcation || {};
      dm.pricebifurcation[roomType] = dm.pricebifurcation[roomType] || {};
      dm.pricebifurcation[roomType][packagetype] = dm.pricebifurcation[roomType][packagetype] || {};
      const list = dm.pricebifurcation[roomType][packagetype][subroom] || [];
      dm.pricebifurcation[roomType][packagetype][subroom] = list;
      list.push({ desc: each.desc });
      String(each.packagemaster || '').split('\n').forEach((line) => {
        if (line.trim() === '') return;
        const data = parseList(line);
        (Array.isArray(data) ? data : [data]).forEach((item) => {
          if (item && typeof item === 'object') list.push({ roomitem: item.roomItem, roomprice: parseInt(item.roomprice, 10) });
        });
      });
    });
  });
  return dm;
}

/**
 * renderBHInteriorCalculator's room list: dataMapping keys sorted by
 * "numbering" with the source's comparator. Keys without a number (the
 * package-only rooms, "pricebifurcation", "selectedData") compare as NaN, so
 * the order is whatever the engine's sort makes of that, exactly as on the
 * source (e.g. Kitchen, Guest Bedroom, Living Room… in Chromium).
 * @returns {{key: string, text: string}[]}
 */
export function roomList(dataMapping) {
  return Object.keys(dataMapping)
    .sort((a, b) => dataMapping[a].numbering - dataMapping[b].numbering)
    .filter((key) => key !== 'pricebifurcation' && dataMapping[key]?.text)
    .map((key) => ({ key, text: dataMapping[key].text }));
}

// pricingbifurcation (source, unchanged)
function pricingBifurcation(currentobj, price, pkg, count, items) {
  let cprice = 0;
  const removeStudyTable = items.includes('bedroom') && items.includes('study room');
  const sum = (list) => list.filter((i) => i.roomprice !== undefined).map((i) => i.roomprice)
    .reduce((a, b) => a + b, 0);
  price.filter((p) => p.toLowerCase() === pkg.toLowerCase()).forEach(() => {
    Object.keys(currentobj[pkg]).forEach((type) => {
      let filter = currentobj[pkg][type];
      if (removeStudyTable) filter = filter.filter((room) => room.roomitem !== 'Study table');
      cprice += parseInt(sum(filter), 10);
    });
  });
  if (count > 4 && items.includes('bedroom')) {
    for (let i = 0; i < count - 4; i += 1) {
      const lastobj = Object.keys(currentobj[pkg]).pop();
      let filtertwo = currentobj[pkg][lastobj];
      if (removeStudyTable) filtertwo = filtertwo.filter((room) => room.roomitem !== 'Study table');
      cprice += parseInt(sum(filtertwo), 10);
    }
  }
  return cprice;
}

const cleanDesc = (d) => d.replace('\\n', '\n').replace('<p>', '').replace('</p>', '');

// roomwisedata, non-compare branch (the only one the quote uses)
function roomWiseData(currentobj, price, pkg, count, key) {
  let html = '';
  const card = (label, desc) => `<div class="feature-desc">   <p tabindex="0" class="feature focus-visible-auto-imp">${label}</p>   <p tabindex="0" class="description focus-visible-auto-imp">${cleanDesc(desc)} </p></div>`;
  price.filter((p) => p.toLowerCase() === pkg.toLowerCase()).forEach(() => {
    Object.keys(currentobj[pkg]).forEach((type) => {
      currentobj[pkg][type].filter((i) => i.desc !== undefined).forEach((i) => {
        html += card('Furniture ', i.desc);
      });
    });
  });
  if (count > 4 && key === 'bedroom') {
    for (let i = 0; i < count - 4; i += 1) {
      const lastobj = Object.keys(currentobj[pkg]).pop();
      html += card('Furniture  ', currentobj[pkg][lastobj][0].desc);
    }
  }
  return html;
}

export const numberWithCommas = (value) => Number(value).toLocaleString('en-IN');

/**
 * onClickBHInteriorCalculator: the chosen package's total and, per chosen
 * room, the "feature-description" card the quote PDF lists.
 * Counts keep the source's types: "01" (never changed) becomes 1, changed
 * counts are numbers, so the card reads "Kitchen ( 1 )" / "( 2 )".
 * @returns {{price: string, featureCards: string[]}}
 */
export function quote(dataMapping, pkg) {
  const { selectedData = {} } = dataMapping;
  const items = Object.keys(selectedData);
  const pb = dataMapping.pricebifurcation || {};
  let total = 0;
  let price = '';
  const featureCards = items.map((key) => {
    let count = selectedData[key];
    if (count === '01') count = 1;
    const room = dataMapping[key] || {};
    const pkgData = room[pkg] || { features: [] };
    let html = `<div class="feature-desc" data-room-image="${pkgData.image}">   <p class="feature">Rooms</p>   <p class="description">${room.text} ( ${count} )</p></div>`;
    if (room.check === 'true') {
      const obj = pb[`${count <= 4 ? count : 4} ${key}`] || {};
      const keys = Object.keys(obj);
      total += pricingBifurcation(obj, keys, pkg, count, items);
      html += roomWiseData(obj, keys, pkg, count, key);
    } else {
      total += count * pkgData.price;
    }
    price = `₹ ${numberWithCommas(total)}`;
    (pkgData.features || []).forEach((f) => {
      html += `<div class="feature-desc">   <p class="feature">${f.name}</p>   <p class="description">${f.description} </p></div>`;
    });
    return html;
  });
  return { price, featureCards };
}

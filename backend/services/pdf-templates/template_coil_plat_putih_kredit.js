const { makeRender } = require('./template_coil_plat_putih_builder');

const meta = {
    name: 'Coil & Plat Putih (Kredit)',
    cat_name: 'Coil & Plat Putih',
    description: 'Format A4 Landscape khusus Coil & Plat Putih (Harga Kredit)',
    custom_fields: [],
};



const render = makeRender({
    title: 'COIL & PLAT PUTIH',
    priceType: 'kredit_gudang', // Specifies which price field to pull
    priceLabel: 'KREDIT',       // Label to display above prices
    fontSize: 10
});

module.exports = { meta, render };

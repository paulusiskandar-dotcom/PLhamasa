const { makeRender } = require('./template_cnp_shared');

const meta = {
    name:         'CNP Cash Gudang',
    cat_id:       null,
    cat_name:     'CNP',
    description:  'Template CNP — harga cash gudang, A5 landscape 2-kolom group-aware',
    custom_fields: [
        { key: 'bahan',      label: 'Bahan',      type: 'text' },
        { key: 'berat_asli', label: 'Berat Asli', type: 'text' },
    ],
};

const render = makeRender('cash_gudang', 'CASH GUDANG');

module.exports = { meta, render };

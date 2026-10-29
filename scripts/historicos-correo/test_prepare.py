import unittest
from prepare import prepare

class HistoricalPreparation(unittest.TestCase):
    def source(self, code='90000001', net='100', date='01-01-26'):
        return {'platform':'alo','code':code,'kind':'alo','file':'synthetic.xlsx','mail':'test-id','ts':'2026-01-02T00:00:00+00:00','sheet':'Worksheet','row':{'Contrato':code,'Fecha Firma':date,'Monto Credito':'200','Valor Cuota Inicial':'10','ALO CREDIT PAGO al punto de venta':net}}
    def test_historical_boundaries(self):
        self.assertEqual(len(prepare([self.source(date='31-12-25'),self.source(date='01-09-26')],[],set(),set())),0)
    def test_no_operational_duplicate(self):
        self.assertEqual(prepare([self.source()],[],set(),{('alo','90000001')}),[])
    def test_conflicting_net_is_not_paid_amount(self):
        rows=prepare([self.source(net='100'),self.source(net='120')],[],set(),set())
        self.assertIsNone(rows[0]['pago_neto_historico'])
        self.assertTrue(rows[0]['datos_origen']['reconstruccion_correo_2026']['requiere_revision_importe'])
    def test_negative_preserved_as_evidence(self):
        r=prepare([self.source(net='-10')],[],set(),set())[0]
        self.assertIsNone(r['pago_neto_historico'])
        self.assertEqual(r['datos_origen']['reconstruccion_correo_2026']['netos_en_fuentes'],['-10'])
    def test_no_fake_payment_date_or_verification(self):
        evidence=prepare([self.source()],[],set(),set())[0]['datos_origen']['reconstruccion_correo_2026']
        self.assertFalse(evidence['conciliado_bancariamente'])
        self.assertIsNone(evidence['fecha_real_pago'])
    def test_idempotent_evidence(self):
        a=prepare([self.source()],[],set(),set())
        b=prepare([self.source()],[],set(),set())
        self.assertEqual(a,b)

if __name__=='__main__':unittest.main()

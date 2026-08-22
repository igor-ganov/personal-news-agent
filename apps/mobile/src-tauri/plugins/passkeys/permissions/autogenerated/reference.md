## Default Permission

Позволяет приложению спрашивать системный менеджер учётных данных о ключах
доступа. Сам ключ наружу не отдаётся: команды возвращают только подписанный
ответ WebAuthn, который проверяет сервер.

#### This default permission set includes the following:

- `allow-is-available`
- `allow-create`
- `allow-get`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`passkeys:allow-create`

</td>
<td>

Enables the create command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`passkeys:deny-create`

</td>
<td>

Denies the create command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`passkeys:allow-get`

</td>
<td>

Enables the get command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`passkeys:deny-get`

</td>
<td>

Denies the get command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`passkeys:allow-is-available`

</td>
<td>

Enables the is_available command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`passkeys:deny-is-available`

</td>
<td>

Denies the is_available command without any pre-configured scope.

</td>
</tr>
</table>
